import { z } from 'zod';
import { gradeQuestion } from '@/lib/question-bank';

const inputSchema = z
  .object({
    questionId: z.string().regex(/^[EHP]\d{3}$/),
    choiceId: z.enum(['A', 'B', 'C', 'D']),
  })
  .strict();
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
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
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: '올바른 형식의 답안을 보내 주세요.' },
      { status: 400, headers },
    );
  }
}
