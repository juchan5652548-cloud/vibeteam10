import { z } from 'zod';
import {
  authClient,
  authConfigured,
  privateHeaders,
  sameOrigin,
} from '@/lib/auth-server';
import { loadAccountProgress } from '@/lib/account-progress';
import { readLimitedJson } from '@/lib/limited-json';
import { getPublicQuestions } from '@/lib/question-bank';
import { hintConfigured } from '@/lib/ai-hint';

export async function GET() {
  const aiReady = hintConfigured();
  const githubReady = process.env.GITHUB_AUTH_ENABLED === 'true';
  if (!authConfigured())
    return Response.json(
      { configured: false, aiReady, githubReady, user: null },
      { headers: privateHeaders },
    );
  try {
    const client = await authClient();
    const { data, error } = await client.auth.getUser();
    if (!data.user) {
      if (
        error &&
        error.name !== 'AuthSessionMissingError' &&
        error.status !== 401 &&
        error.status !== 403 &&
        error.code !== 'refresh_token_not_found'
      )
        throw new Error('AUTH_UNAVAILABLE');
      return Response.json(
        { configured: true, aiReady, githubReady, user: null },
        { headers: privateHeaders },
      );
    }
    if (error) throw new Error('AUTH_UNAVAILABLE');
    const progress = await loadAccountProgress(client, data.user.id);
    return Response.json(
      {
        configured: true,
        aiReady,
        githubReady,
        user: { id: data.user.id, email: data.user.email ?? '' },
        progress,
      },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      {
        error:
          '계정 기록을 불러오지 못했어요. 새로고침해서 다시 시도해 주세요.',
      },
      { status: 503, headers: privateHeaders },
    );
  }
}

const bookmarkSchema = z
  .object({ questionId: z.string().regex(/^[EHP]\d{3}$/), saved: z.boolean() })
  .strict();
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: '허용되지 않은 요청이에요.' },
      { status: 403, headers: privateHeaders },
    );
  if (!authConfigured())
    return Response.json(
      { error: '로그인 연결 준비 중이에요.' },
      { status: 503, headers: privateHeaders },
    );
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json(
      { error: 'JSON 요청이 필요해요.' },
      { status: 415, headers: privateHeaders },
    );
  try {
    const client = await authClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      return Response.json(
        { error: '다시 로그인해 주세요.' },
        { status: 401, headers: privateHeaders },
      );
    const parsed = bookmarkSchema.safeParse(
      await readLimitedJson(request, 1024),
    );
    if (!parsed.success)
      return Response.json(
        { error: '문제 정보를 확인해 주세요.' },
        { status: 400, headers: privateHeaders },
      );
    const { questionId, saved } = parsed.data;
    if (!getPublicQuestions().some((q) => q.id === questionId))
      return Response.json(
        { error: '없는 문제예요.' },
        { status: 404, headers: privateHeaders },
      );
    const result = saved
      ? await client
          .from('practice_bookmarks')
          .upsert(
            { user_id: data.user.id, question_id: questionId },
            { onConflict: 'user_id,question_id', ignoreDuplicates: true },
          )
      : await client
          .from('practice_bookmarks')
          .delete()
          .eq('user_id', data.user.id)
          .eq('question_id', questionId);
    if (result.error) throw new Error('BOOKMARK_FAILED');
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return Response.json(
      { error: '북마크를 저장하지 못했어요. 다시 시도해 주세요.' },
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
