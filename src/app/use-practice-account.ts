'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import {
  getProgressSnapshot,
  getServerProgressSnapshot,
  parseProgress,
  progressSchema,
  subscribeProgress,
  updateProgress,
  type Progress,
} from '@/lib/practice-storage';
import type { Attempt } from '@/lib/practice-types';

const accountSchema = z.object({
  configured: z.boolean(),
  aiReady: z.boolean().default(false),
  googleReady: z.boolean().default(false),
  user: z.object({ id: z.uuid(), email: z.string() }).nullable(),
  progress: progressSchema.optional(),
});
type Account = z.infer<typeof accountSchema>;

export function usePracticeAccount() {
  const snapshot = useSyncExternalStore(
    subscribeProgress,
    getProgressSnapshot,
    getServerProgressSnapshot,
  );
  const guestProgress = useMemo(() => parseProgress(snapshot), [snapshot]);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [cloud, setCloud] = useState<Progress>({
    version: 1,
    attempts: [],
    bookmarks: [],
  });
  useEffect(() => {
    const onAuthChange = (event: StorageEvent) => {
      if (event.key === 'jobfit-auth-event') window.location.reload();
    };
    window.addEventListener('storage', onAuthChange);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    void fetch('/api/account', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('ACCOUNT_UNAVAILABLE');
        const result = accountSchema.parse(await response.json());
        if (result.user && !result.progress)
          throw new Error('PROGRESS_MISSING');
        setCloud(
          result.progress ?? { version: 1, attempts: [], bookmarks: [] },
        );
        setAccount(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            '계정 기록을 불러오지 못했어요. 새로고침해서 다시 시도해 주세요.',
          );
        else
          setError(
            '계정 연결이 지연되고 있어요. 새로고침해서 다시 시도해 주세요.',
          );
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.removeEventListener('storage', onAuthChange);
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  const ready = account !== null;
  function recordAttempt(attempt: Attempt) {
    if (!ready) return false;
    if (account.user) {
      setCloud((current) => ({
        ...current,
        attempts: [
          ...current.attempts.filter((a) => a.attemptId !== attempt.attemptId),
          attempt,
        ].slice(-500),
      }));
      return true;
    }
    return updateProgress((current) => ({
      ...current,
      attempts: [...current.attempts, attempt].slice(-500),
    }));
  }
  async function bookmark(id: string, saved: boolean) {
    if (!ready) return false;
    if (!account.user)
      return updateProgress((current) => ({
        ...current,
        bookmarks: saved
          ? [...new Set([...current.bookmarks, id])]
          : current.bookmarks.filter((q) => q !== id),
      }));
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: id, saved }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return false;
      setCloud((current) => ({
        ...current,
        bookmarks: saved
          ? [...new Set([...current.bookmarks, id])]
          : current.bookmarks.filter((q) => q !== id),
      }));
      return true;
    } catch {
      return false;
    }
  }
  return {
    progress: account?.user
      ? cloud
      : ready
        ? guestProgress
        : { version: 1 as const, attempts: [], bookmarks: [] },
    user: account?.user ?? null,
    ready,
    error,
    configured: account?.configured ?? false,
    aiReady: account?.aiReady ?? false,
    googleReady: account?.googleReady ?? false,
    recordAttempt,
    bookmark,
  };
}
