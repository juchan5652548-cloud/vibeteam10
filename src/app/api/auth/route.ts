import { z } from 'zod';
import {
  authClient,
  authConfigured,
  privateHeaders,
  sameOrigin,
} from '@/lib/auth-server';
import { readLimitedJson } from '@/lib/limited-json';

const credentials = z
  .object({
    action: z.enum(['login', 'signup']),
    email: z.email().max(254).trim(),
    password: z.string().min(8).max(128),
  })
  .strict();
const inputSchema = z.union([
  credentials,
  z.object({ action: z.literal('github') }).strict(),
  z.object({ action: z.literal('logout') }).strict(),
  z
    .object({ action: z.literal('recover'), email: z.email().max(254).trim() })
    .strict(),
  z
    .object({
      action: z.literal('password'),
      password: z.string().min(8).max(128),
    })
    .strict(),
]);

function authLimitResponse(error: { status?: number; code?: string } | null) {
  const emailLimited = error?.code === 'over_email_send_rate_limit';
  const requestLimited = error?.code === 'over_request_rate_limit';
  if (!emailLimited && !requestLimited && error?.status !== 429) return null;
  return Response.json(
    {
      code: emailLimited
        ? 'EMAIL_SEND_LIMITED'
        : requestLimited
          ? 'AUTH_REQUEST_LIMITED'
          : 'AUTH_RATE_LIMITED',
      error: emailLimited
        ? '인증 메일 발송 한도에 도달했어요. 계속되면 운영자의 메일 발송 설정 확인이 필요해요. GitHub 간편 로그인은 이용할 수 있어요.'
        : '짧은 시간에 인증 요청이 반복됐어요. 잠시 기다린 뒤 다시 시도해 주세요.',
      // A pause between submissions, not the provider quota reset time.
      retryAfterSeconds: 60,
    },
    { status: 429, headers: privateHeaders },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: '허용되지 않은 요청이에요.' },
      { status: 403, headers: privateHeaders },
    );
  if (!authConfigured())
    return Response.json(
      { error: '로그인 연결을 준비하고 있어요. 잠시 후 다시 이용해 주세요.' },
      { status: 503, headers: privateHeaders },
    );
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json(
      { error: 'JSON 요청이 필요해요.' },
      { status: 415, headers: privateHeaders },
    );
  try {
    const parsed = inputSchema.safeParse(await readLimitedJson(request, 2048));
    if (!parsed.success)
      return Response.json(
        { error: '이메일 형식과 비밀번호(8~128자)를 확인해 주세요.' },
        { status: 400, headers: privateHeaders },
      );
    const client = await authClient();
    const input = parsed.data;
    const origin = new URL(request.url).origin;
    if (input.action === 'github') {
      if (process.env.GITHUB_AUTH_ENABLED !== 'true')
        return Response.json(
          {
            error:
              'GitHub 로그인 연결을 준비하고 있어요. 잠시 후 다시 시도해 주세요.',
          },
          { status: 503, headers: privateHeaders },
        );
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${origin}/auth/callback`,
          skipBrowserRedirect: true,
          scopes: 'read:user user:email',
        },
      });
      if (error || !data.url)
        return Response.json(
          {
            error:
              'GitHub 로그인 연결을 준비하고 있어요. 잠시 후 다시 시도해 주세요.',
          },
          { status: 503, headers: privateHeaders },
        );
      const target = new URL(data.url);
      if (
        target.origin !==
          new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
        target.pathname !== '/auth/v1/authorize'
      )
        throw new Error('INVALID_AUTH_DESTINATION');
      return Response.json({ url: target.href }, { headers: privateHeaders });
    }
    if (input.action === 'logout') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('AUTH_FAILED');
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    if (input.action === 'recover') {
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${origin}/auth/callback?recovery=1`,
      });
      const limited = authLimitResponse(error);
      if (limited) return limited;
      if (error) throw new Error('RECOVERY_FAILED');
      return Response.json(
        {
          ok: true,
          message:
            '해당 이메일로 복구 가능한 계정이 있으면 비밀번호 재설정 안내를 보내요. 스팸함도 확인해 주세요.',
        },
        { headers: privateHeaders },
      );
    }
    if (input.action === 'password') {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user)
        return Response.json(
          { error: '메일의 재설정 링크로 다시 접속해 주세요.' },
          { status: 401, headers: privateHeaders },
        );
      const result = await client.auth.updateUser({ password: input.password });
      if (result.error) throw new Error('PASSWORD_FAILED');
      return Response.json(
        { ok: true, message: '비밀번호가 변경됐어요.' },
        { headers: privateHeaders },
      );
    }
    const result =
      input.action === 'login'
        ? await client.auth.signInWithPassword({
            email: input.email,
            password: input.password,
          })
        : await client.auth.signUp({
            email: input.email,
            password: input.password,
            options: { emailRedirectTo: `${origin}/auth/callback` },
          });
    if (result.error) {
      const limited = authLimitResponse(result.error);
      if (limited) return limited;
      return Response.json(
        {
          error:
            input.action === 'login'
              ? '이메일·비밀번호 또는 이메일 인증 여부를 확인해 주세요.'
              : '가입하지 못했어요. 입력 정보와 메일 발송 상태를 확인하거나 로그인을 시도해 주세요.',
        },
        { status: 400, headers: privateHeaders },
      );
    }
    return Response.json(
      {
        ok: true,
        signedIn: Boolean(result.data.session),
        message: result.data.session
          ? '로그인됐어요.'
          : '이메일의 가입 확인 링크를 눌러 주세요. 이미 가입했다면 로그인 또는 비밀번호 재설정을 이용해 주세요.',
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RangeError
            ? '요청이 너무 커요.'
            : error instanceof SyntaxError
              ? '입력 정보를 확인해 주세요.'
              : '인증 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
      },
      {
        status:
          error instanceof RangeError
            ? 413
            : error instanceof SyntaxError
              ? 400
              : 503,
        headers: privateHeaders,
      },
    );
  }
}
