import { z } from 'zod';

const count = z.number().int().nonnegative().safe();
const accuracy = z.number().min(0).max(100).nullable();
export const adminReportSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.literal(50),
  totalUsers: count,
  summary: z.object({
    activeUsers: count,
    attempts: count,
    correct: count,
    wrong: count,
    ungraded: count,
    accuracy,
  }),
  users: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        email: z.string(),
        attempts: count,
        uniqueQuestions: count,
        correct: count,
        wrong: count,
        ungraded: count,
        accuracy,
        elapsedSeconds: count,
        lastActiveAt: z.iso.datetime({ offset: true }).nullable(),
      }),
    )
    .max(50),
});
export type AdminReport = z.infer<typeof adminReportSchema>;
