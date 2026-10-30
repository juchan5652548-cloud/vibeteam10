import {
  tracks,
  type Attempt,
  type PublicQuestion,
  type Track,
} from './practice-types';

export type LearningArea = {
  track: Track;
  name: string;
  total: number;
  submissions: number;
  correct: number;
  rate: number | null;
  averageSeconds: number | null;
};

// A repeated submission is learning history, not another independent sample.
// Only the latest answer per question determines the current learning profile.
export function buildLearningSummary(
  questions: PublicQuestion[],
  attempts: Attempt[],
  track: Track | 'all' = 'all',
) {
  const pool = questions.filter((q) => track === 'all' || q.track === track);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const records = [
    ...new Map(
      attempts
        .filter((a) => byId.has(a.questionId))
        .map((a) => [a.attemptId, a]),
    ).values(),
  ].sort(
    (a, b) =>
      a.completedAt.localeCompare(b.completedAt) ||
      a.attemptId.localeCompare(b.attemptId),
  );
  const latest = new Map(records.map((a) => [a.questionId, a]));
  const areas = new Map<string, LearningArea>();
  for (const q of pool) {
    const key = `${q.track}:${q.area}`;
    if (!areas.has(key))
      areas.set(key, {
        track: q.track,
        name: q.area,
        total: 0,
        submissions: 0,
        correct: 0,
        rate: null,
        averageSeconds: null,
      });
  }
  for (const a of records) {
    const q = byId.get(a.questionId)!;
    areas.get(`${q.track}:${q.area}`)!.submissions++;
  }
  const time = new Map<string, number>();
  for (const a of latest.values()) {
    const q = byId.get(a.questionId)!;
    const key = `${q.track}:${q.area}`;
    const item = areas.get(key)!;
    item.total++;
    item.correct += Number(a.correct);
    time.set(key, (time.get(key) ?? 0) + a.elapsedSeconds);
  }
  for (const [key, item] of areas) {
    if (item.total) {
      item.rate = Math.round((100 * item.correct) / item.total);
      item.averageSeconds = Math.round((time.get(key) ?? 0) / item.total);
    }
  }
  const rows = [...areas.values()];
  const weakest =
    rows
      .filter((a) => a.total >= 3 && a.correct < a.total)
      .sort(
        (a, b) =>
          a.correct / a.total - b.correct / b.total || b.total - a.total,
      )[0] ?? null;
  const mistakes = new Map<string, number>();
  for (const a of latest.values())
    if (!a.correct && a.misconception) {
      mistakes.set(a.misconception, (mistakes.get(a.misconception) ?? 0) + 1);
    }
  return {
    track,
    submissions: records.length,
    uniqueQuestions: latest.size,
    correct: [...latest.values()].filter((a) => a.correct).length,
    areas: rows,
    weakest,
    mistakePatterns: [...mistakes]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    lastCompletedAt: records.at(-1)?.completedAt ?? null,
  };
}

export type LearningSummary = ReturnType<typeof buildLearningSummary>;

export function recommendQuestions(
  questions: PublicQuestion[],
  attempts: Attempt[],
  track: Track | 'all' = 'all',
  limit = 5,
) {
  const summary = buildLearningSummary(questions, attempts, track);
  const latest = new Map(
    [...attempts]
      .sort(
        (a, b) =>
          a.completedAt.localeCompare(b.completedAt) ||
          a.attemptId.localeCompare(b.attemptId),
      )
      .map((a) => [a.questionId, a]),
  );
  const priority = (q: PublicQuestion) =>
    !latest.has(q.id) ? 1 : latest.get(q.id)!.correct ? 2 : 0;
  const candidates = questions
    .filter(
      (q) =>
        (track === 'all' || q.track === track) &&
        (!summary.weakest ||
          (q.track === summary.weakest.track &&
            q.area === summary.weakest.name)),
    )
    .sort((a, b) => priority(a) - priority(b));
  const unfinished = candidates.filter((q) => priority(q) < 2);
  const pool = unfinished.length ? unfinished : candidates;
  const selected: PublicQuestion[] = [];
  const subtypes = new Set<string>();
  for (const q of pool) {
    const key = `${q.track}:${q.area}:${q.subtype}`;
    if (!subtypes.has(key)) {
      subtypes.add(key);
      selected.push(q);
      if (selected.length >= limit) return selected;
    }
  }
  const ids = new Set(selected.map((q) => q.id));
  return [...selected, ...pool.filter((q) => !ids.has(q.id))].slice(0, limit);
}

export function diagnosticQuestions(
  questions: PublicQuestion[],
  attempts: Attempt[],
  track: Track | 'all' = 'all',
  limit = 6,
) {
  const summary = buildLearningSummary(questions, attempts, track);
  const seen = new Set(attempts.map((a) => a.questionId));
  const groups = tracks
    .filter((t) => track === 'all' || t.id === track)
    .map((t) => {
      const areas = summary.areas
        .filter((a) => a.track === t.id)
        .sort((a, b) => a.total - b.total);
      const buckets = areas.map((a) =>
        questions
          .filter((q) => q.track === t.id && q.area === a.name)
          .sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id))),
      );
      const interleaved: PublicQuestion[] = [];
      for (let index = 0; index < limit; index++)
        for (const bucket of buckets) {
          if (bucket[index]) interleaved.push(bucket[index]);
        }
      return interleaved;
    });
  const selected: PublicQuestion[] = [];
  for (let index = 0; index < limit && selected.length < limit; index++)
    for (const group of groups) {
      if (group[index] && selected.length < limit) selected.push(group[index]);
    }
  return selected;
}
