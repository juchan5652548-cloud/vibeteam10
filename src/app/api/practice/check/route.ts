import { z } from 'zod';
import { gradeQuestion } from '@/lib/question-bank';
import { authClient, authConfigured, privateHeaders } from '@/lib/auth-server';

const inputSchema = z
  .object({
    questionId: z.string().regex(/^[EHP]\d{3}$/),
    choiceId: z.enum(['A', 'B', 'C', 'D']),
    attemptId: z.uuid().optional(),
    elapsedSeconds: z.number().int().min(0).max(86400).default(0),
    requireAccount: z.boolean().default(false),
  })
  .strict();
const headers = privateHeaders;

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if ((authConfigured() || origin) && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: '허용되지 않은 요청입니다.' },
      { status: 403, headers },
    );
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json(
      { error: 'JSON 요청이 필요합니다.' },
      { status: 415, headers },
    );
  }
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: '답안을 선택해 주세요.' },
      { status: 400, headers },
    );
  let text = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        return Response.json(
          { error: '요청 크기가 너무 큽니다.' },
          { status: 413, headers },
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed = inputSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return Response.json(
        { error: '문제와 답안 정보를 확인해 주세요.' },
        { status: 400, headers },
      );
    const result = gradeQuestion(parsed.data.questionId, parsed.data.choiceId);
    if (!result)
      return Response.json(
        { error: '문제를 찾을 수 없습니다.' },
        { status: 404, headers },
      );
    const attemptId = parsed.data.attemptId ?? crypto.randomUUID();
    if (parsed.data.requireAccount && !authConfigured())
      return Response.json(
        { error: '계정 저장 연결을 확인해 주세요.' },
        { status: 503, headers },
      );
    let completedAt = new Date().toISOString();
    let elapsedSeconds = parsed.data.elapsedSeconds;
    if (authConfigured()) {
      try {
        const client = await authClient();
        const { data, error } = await client.auth.getUser();
        if (parsed.data.requireAccount && !data.user)
          return Response.json(
            { error: '세션이 만료됐어요. 다시 로그인해 주세요.' },
            { status: 401, headers },
          );
        if (error && error.name !== 'AuthSessionMissingError') {
          return Response.json(
            { error: '로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.' },
            { status: 401, headers },
          );
        }
        if (data.user) {
          const insert = await client.from('practice_attempts').upsert(
            {
              id: attemptId,
              user_id: data.user.id,
              question_id: parsed.data.questionId,
              choice_id: parsed.data.choiceId,
              elapsed_seconds: parsed.data.elapsedSeconds,
            },
            { onConflict: 'id', ignoreDuplicates: true },
          );
          if (insert.error) throw new Error('ATTEMPT_SAVE_FAILED');
          const stored = await client
            .from('practice_attempts')
            .select('question_id,choice_id,elapsed_seconds,completed_at')
            .eq('id', attemptId)
            .eq('user_id', data.user.id)
            .single();
          if (
            stored.error ||
            stored.data.question_id !== parsed.data.questionId ||
            stored.data.choice_id !== parsed.data.choiceId
          )
            throw new Error('ATTEMPT_CONFLICT');
          completedAt = new Date(stored.data.completed_at).toISOString();
          elapsedSeconds = stored.data.elapsed_seconds;
        }
      } catch {
        return Response.json(
          {
            error:
              '계정에 풀이 기록을 저장하지 못했어요. 답안을 유지했으니 다시 시도해 주세요.',
          },
          { status: 503, headers },
        );
      }
    }
    return Response.json(
      { ...result, attemptId, completedAt, elapsedSeconds },
      { headers },
    );
  } catch {
    return Response.json(
      { error: '올바른 형식의 답안을 보내 주세요.' },
      { status: 400, headers },
    );
  }
}
