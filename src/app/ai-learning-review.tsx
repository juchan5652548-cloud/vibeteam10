'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { Track } from '@/lib/practice-types';
import { Icon } from './practice-icons';

const responseSchema = z.object({
  text: z.string().min(1).max(5000),
  model: z.string(),
  sampleSize: z.number().int().positive(),
  submissions: z.number().int().positive(),
  track: z.enum(['all', 'enterprise', 'public_ncs', 'hospital']),
});

export default function AiLearningReview({
  track,
  sampleSize,
  signedIn,
  ready,
  onLogin,
}: {
  track: Track | 'all';
  sampleSize: number;
  signedIn: boolean;
  ready: boolean;
  onLogin: () => void;
}) {
  const [result, setResult] = useState<z.infer<typeof responseSchema> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );

  async function analyze() {
    if (active.current || !signedIn || !ready || !sampleSize) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/practice/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(29_000),
        ]),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const failure = z
          .object({ error: z.string().max(300) })
          .safeParse(body);
        throw new Error(
          failure.success
            ? failure.data.error
            : 'AI 분석을 받지 못했어요. 다시 시도해 주세요.',
        );
      }
      const review = responseSchema.parse(body);
      if (review.track !== track)
        throw new Error('분석한 분야를 확인하지 못했어요. 다시 시도해 주세요.');
      if (!controller.signal.aborted) setResult(review);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error && cause.name === 'Error'
            ? cause.message
            : '응답이 지연되거나 연결이 끊겼어요. 기본 분석을 보면서 다시 시도해 주세요.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return (
    <section
      className="card learning-coach"
      aria-labelledby="learning-coach-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI LEARNING COACH</p>
          <h2 id="learning-coach-title">
            <Icon name="spark" /> 내 기록으로 다음 학습 찾기
          </h2>
        </div>
        <span className="tag purple">실제 AI 분석</span>
      </div>
      <p className="muted">
        서버에 저장된 풀이 기록을 바탕으로, 잘한 점과 다음에 연습할 방법을 짧게
        설명해요.
      </p>
      {result && (
        <div className="coach-answer" aria-live="polite">
          <p>{result.text}</p>
          <small>
            서로 다른 {result.sampleSize}문제 · {result.submissions}회 제출 근거
            · {result.model}
          </small>
        </div>
      )}
      <div aria-live="polite" aria-busy={pending}>
        {pending && (
          <p className="coach-status" role="status">
            기록을 읽고 학습 방향을 정리하고 있어요. 최대 30초 정도 걸릴 수
            있어요…
          </p>
        )}
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
      </div>
      {!signedIn ? (
        <button className="button primary" onClick={onLogin}>
          로그인하고 내 기록 분석하기
        </button>
      ) : (
        <button
          className="button primary"
          onClick={() => void analyze()}
          disabled={pending || !ready || !sampleSize}
        >
          {pending
            ? 'AI 분석 중…'
            : result
              ? 'AI 분석 다시 받기'
              : 'AI 학습 분석 받기'}{' '}
          <Icon name="spark" size={16} />
        </button>
      )}
      {signedIn && !sampleSize && (
        <p className="muted">
          선택한 분야에서 한 문제 이상 풀면 분석을 시작할 수 있어요.
        </p>
      )}
      {signedIn && !ready && (
        <p className="muted">
          AI 연결 준비 중이에요. 위의 기본 분석과 추천 학습은 이용할 수 있어요.
        </p>
      )}
      <p className="ai-disclosure">
        버튼을 누르면 이름·이메일을 제외한 학습 통계가 Google Gemini에 전송되며,
        무료 서비스의 제품 개선에 사용될 수 있어요. AI 조언은 틀릴 수 있으므로
        위의 실제 집계와 함께 확인하세요. AI 연결이 끊겨도 채점·기록·추천은
        유지돼요.
      </p>
    </section>
  );
}
