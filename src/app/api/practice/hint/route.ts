import { getPublicQuestions } from '@/lib/question-bank';
import { acquireHintSlot, generateHint, hintInputSchema } from '@/lib/ai-hint';
import { readLimitedJson } from '@/lib/limited-json';

export const maxDuration = 30;
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    return Response.json(
      { error: '이 사이트의 문제 풀이 화면에서 질문해 주세요.' },
      { status: 403, headers },
    );
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json(
      { error: '올바른 형식으로 질문해 주세요.' },
      { status: 415, headers },
    );
  let input;
  try {
    const parsed = hintInputSchema.safeParse(
      await readLimitedJson(request, 12_000),
    );
    if (!parsed.success)
      return Response.json(
        { error: '질문은 1~300자로 입력해 주세요.' },
        { status: 400, headers },
      );
    input = parsed.data;
  } catch (cause) {
    return Response.json(
      { error: '질문의 형식이나 길이를 확인해 주세요.' },
      { status: cause instanceof RangeError ? 413 : 400, headers },
    );
  }
  const question = getPublicQuestions().find((q) => q.id === input.questionId);
  if (!question)
    return Response.json(
      { error: '문제를 찾을 수 없어요.' },
      { status: 404, headers },
    );
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          'AI 선생님을 연결하는 중이에요. 운영자가 OpenAI API 키를 등록하면 실제 힌트를 받을 수 있어요.',
        code: 'AI_NOT_CONFIGURED',
      },
      { status: 503, headers },
    );
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const release = acquireHintSlot(ip, key);
  if (!release)
    return Response.json(
      {
        error:
          '질문이 잠시 몰렸어요. 진행 중인 답변을 기다리거나 잠시 후 다시 물어봐 주세요.',
      },
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    );
  try {
    return Response.json(await generateHint(question, input, key), { headers });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : '';
    const error =
      code === 'PROVIDER_AUTH'
        ? 'AI 연결 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.'
        : code === 'PROVIDER_LIMIT'
          ? 'AI 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
          : 'AI 답변을 받지 못했어요. 질문은 유지되니 다시 시도해 주세요.';
    return Response.json(
      { error },
      { status: code === 'PROVIDER_LIMIT' ? 429 : 502, headers },
    );
  } finally {
    release();
  }
}
