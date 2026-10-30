import { z } from 'zod';
import {
  authClient,
  authConfigured,
  privateHeaders,
  sameOrigin,
} from '@/lib/auth-server';
import { loadAccountProgress } from '@/lib/account-progress';
import { getPublicQuestions } from '@/lib/question-bank';
import { buildLearningSummary } from '@/lib/learning-analysis';
import { generateLearningReview } from '@/lib/learning-coach';
import { acquireHintSlot } from '@/lib/ai-hint';
import { readLimitedJson } from '@/lib/limited-json';

export const maxDuration = 30;
const inputSchema = z
  .object({ track: z.enum(['all', 'enterprise', 'public_ncs', 'hospital']) })
  .strict();
const fail = (error: string, status: number) =>
  Response.json(
    { error },
    {
      status,
      headers:
        status === 429
          ? { ...privateHeaders, 'Retry-After': '60' }
          : privateHeaders,
    },
  );

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return fail('학습 분석 화면에서 요청해 주세요.', 403);
  if (!request.headers.get('content-type')?.includes('application/json'))
    return fail('JSON 요청이 필요해요.', 415);
  const deadline = AbortSignal.any([
    AbortSignal.timeout(25_000),
    request.signal,
  ]);
  let input;
  try {
    input = inputSchema.safeParse(await readLimitedJson(request, 1024));
  } catch (error) {
    return fail(
      '요청 형식과 크기를 확인해 주세요.',
      error instanceof RangeError ? 413 : 400,
    );
  }
  if (!input.success) return fail('분석할 지원 분야를 확인해 주세요.', 400);
  if (!authConfigured())
    return fail('로그인 후 AI 학습 분석을 이용해 주세요.', 401);
  let release: (() => void) | null = null;
  try {
    const client = await authClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      return fail('로그인 후 AI 학습 분석을 이용해 주세요.', 401);
    const key = process.env.GEMINI_API_KEY;
    if (!key)
      return fail(
        'AI 연결 준비 중이에요. 기본 분석과 추천 학습은 계속 이용할 수 있어요.',
        503,
      );
    const progress = await loadAccountProgress(client, data.user.id);
    const summary = buildLearningSummary(
      getPublicQuestions(),
      progress.attempts,
      input.data.track,
    );
    if (!summary.uniqueQuestions)
      return fail('선택한 분야에서 한 문제 이상 풀고 분석해 주세요.', 422);
    release = acquireHintSlot(data.user.id, key);
    if (!release)
      return fail(
        'AI 요청이 잠시 몰렸어요. 진행 중인 답변을 기다리거나 잠시 후 다시 시도해 주세요.',
        429,
      );
    const result = await generateLearningReview(summary, key, deadline);
    return Response.json(
      {
        ...result,
        sampleSize: summary.uniqueQuestions,
        submissions: summary.submissions,
        track: input.data.track,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return fail(
      error instanceof Error && error.message === 'PROVIDER_LIMIT'
        ? '무료 AI 사용 한도에 도달했어요. 기본 분석과 추천 학습은 계속 이용할 수 있어요.'
        : 'AI 분석을 불러오지 못했어요. 기본 분석은 유지돼요. 잠시 후 다시 시도해 주세요.',
      error instanceof Error && error.message === 'PROVIDER_LIMIT' ? 429 : 503,
    );
  } finally {
    release?.();
  }
}
