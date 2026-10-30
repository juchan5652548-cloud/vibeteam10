import { z } from 'zod';
import { authClient, authConfigured, privateHeaders } from '@/lib/auth-server';
import { getAdminAccess } from '@/lib/admin-access';
import { adminReportSchema } from '@/lib/admin-types';
import { getQuestionAnswerKey } from '@/lib/question-bank';

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    search: z.string().trim().max(80).default(''),
    track: z
      .enum(['all', 'enterprise', 'public_ncs', 'hospital'])
      .default('all'),
    sort: z.enum(['recent', 'attempts', 'wrong', 'accuracy']).default('recent'),
  })
  .strict();

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  if (!authConfigured()) return failure('로그인 연결을 확인해 주세요.', 503);
  try {
    const client = await authClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return failure('로그인이 필요합니다.', 401);
    const access = await getAdminAccess(client);
    if (access === 'unavailable')
      return failure(
        '관리자 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        503,
      );
    if (access !== 'admin') return failure('관리자만 조회할 수 있습니다.', 403);

    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== [...params.keys()].length)
      return failure('조회 조건을 확인해 주세요.', 400);
    const parsed = querySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return failure('조회 조건을 확인해 주세요.', 400);
    const { page, search, track, sort } = parsed.data;
    const result = await client.rpc('jobfit_admin_learning_stats', {
      p_answer_key: getQuestionAnswerKey(),
      p_page: page,
      p_search: search,
      p_track: track,
      p_sort: sort,
    });
    if (result.error) {
      if (result.error.code === '42501')
        return failure('관리자만 조회할 수 있습니다.', 403);
      return failure(
        '학습 통계를 불러오지 못했습니다. 다시 시도해 주세요.',
        503,
      );
    }
    const report = adminReportSchema.parse(result.data);
    return Response.json(report, { headers: privateHeaders });
  } catch {
    return failure('학습 통계를 불러오지 못했습니다. 다시 시도해 주세요.', 503);
  }
}
