import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { gradeQuestion } from './question-bank';
import type { Progress } from './practice-storage';

const rowSchema = z.object({
  id: z.uuid(),
  question_id: z.string(),
  choice_id: z.enum(['A', 'B', 'C', 'D']),
  elapsed_seconds: z.number().int().min(0).max(86400),
  completed_at: z.string(),
});

export async function loadAccountProgress(
  client: SupabaseClient,
  userId: string,
): Promise<Progress> {
  const [attempts, bookmarks] = await Promise.all([
    client
      .from('practice_attempts')
      .select('id,question_id,choice_id,elapsed_seconds,completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(500),
    client
      .from('practice_bookmarks')
      .select('question_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (attempts.error || bookmarks.error)
    throw new Error('PROGRESS_UNAVAILABLE');
  return {
    version: 1,
    attempts: z
      .array(rowSchema)
      .parse(attempts.data)
      .reverse()
      .flatMap((row) => {
        const grade = gradeQuestion(row.question_id, row.choice_id);
        return grade
          ? [
              {
                ...grade,
                attemptId: row.id,
                elapsedSeconds: row.elapsed_seconds,
                completedAt: new Date(row.completed_at).toISOString(),
              },
            ]
          : [];
      }),
    bookmarks: z
      .array(z.object({ question_id: z.string() }))
      .parse(bookmarks.data)
      .map((row) => row.question_id),
  };
}
