import { z } from 'zod';
import type { Attempt } from './practice-types';

export const gradeSchema = z.object({
  questionId: z.string(),
  choiceId: z.string(),
  correct: z.boolean(),
  answerId: z.string(),
  explanation: z.string(),
  feedback: z.string(),
  misconception: z.string().nullable(),
});
const progressSchema = z.object({
  version: z.literal(1),
  attempts: z
    .array(
      gradeSchema.extend({
        attemptId: z.string(),
        elapsedSeconds: z.number().finite().min(0).max(86400),
        completedAt: z.iso.datetime(),
      }),
    )
    .max(500),
  bookmarks: z.array(z.string()).max(200),
});
export type Progress = { version: 1; attempts: Attempt[]; bookmarks: string[] };
const empty: Progress = { version: 1, attempts: [], bookmarks: [] };
const key = 'jobfit-progress-v1';

export function subscribeProgress(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('jobfit-progress', callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('jobfit-progress', callback);
  };
}
export function getProgressSnapshot() {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function getServerProgressSnapshot() {
  return null;
}
export function parseProgress(value: string | null): Progress {
  if (!value || value.length > 1_500_000) return empty;
  try {
    const parsed = progressSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : empty;
  } catch {
    return empty;
  }
}
export function updateProgress(update: (current: Progress) => Progress) {
  try {
    const next = update(parseProgress(getProgressSnapshot()));
    window.localStorage.setItem(
      key,
      JSON.stringify(progressSchema.parse(next)),
    );
    window.dispatchEvent(new Event('jobfit-progress'));
    return true;
  } catch {
    return false;
  }
}
