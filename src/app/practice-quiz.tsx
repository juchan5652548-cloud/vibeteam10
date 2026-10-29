'use client';

import { useEffect, useRef, useState } from 'react';
import { gradeSchema } from '@/lib/practice-storage';
import {
  formatTime,
  tracks,
  type Attempt,
  type Grade,
  type PublicQuestion,
} from '@/lib/practice-types';
import { Icon } from './practice-icons';
import AiHint from './ai-hint';
import { z } from 'zod';

export default function PracticeQuiz({
  questions,
  title,
  onAttempt,
  onClose,
  signedIn = false,
  aiReady = false,
}: {
  questions: PublicQuestion[];
  title: string;
  onAttempt: (attempt: Attempt) => void;
  onClose: () => void;
  signedIn?: boolean;
  aiReady?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [grade, setGrade] = useState<Grade | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<Attempt[]>([]);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(0);
  const locked = useRef(false);
  const attemptKey = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = questions[index];

  useEffect(() => {
    startedAt.current = Date.now();
    heading.current?.focus();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [index]);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function checkAnswer() {
    if (!selected || locked.current || grade) return;
    locked.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const seconds = Math.min(
      86400,
      Math.max(0, Math.round((Date.now() - startedAt.current) / 1000)),
    );
    try {
      attemptKey.current ??= crypto.randomUUID();
      const response = await fetch('/api/practice/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          choiceId: selected,
          attemptId: attemptKey.current,
          elapsedSeconds: seconds,
          requireAccount: signedIn,
        }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          '채점하지 못했어요. 선택한 답안은 유지돼요. 다시 시도해 주세요.',
        );
      const result = gradeSchema
        .extend({ attemptId: z.uuid(), completedAt: z.iso.datetime() })
        .parse(await response.json());
      if (result.questionId !== question.id || result.choiceId !== selected)
        throw new Error('채점 응답을 확인하지 못했어요. 다시 시도해 주세요.');
      const attempt: Attempt = {
        ...result,
        attemptId: result.attemptId,
        elapsedSeconds: seconds,
        completedAt: result.completedAt,
      };
      setGrade(result);
      setResults((current) => [...current, attempt]);
      onAttempt(attempt);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : '잠시 후 다시 시도해 주세요.',
        );
      else
        setError('연결이 지연되고 있어요. 답안은 유지되니 다시 시도해 주세요.');
    } finally {
      window.clearTimeout(timeout);
      setPending(false);
      locked.current = false;
    }
  }

  function nextQuestion() {
    if (index === questions.length - 1) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    attemptKey.current = null;
    setSelected('');
    setGrade(null);
    setElapsed(0);
    setError('');
  }

  const correctCount = results.filter((item) => item.correct).length;
  if (finished)
    return (
      <section className="session-result card">
        <span className="result-medal">
          <Icon name="check" size={32} />
        </span>
        <p className="eyebrow">SESSION COMPLETE</p>
        <h1>오늘도 한 걸음 더 가까워졌어요.</h1>
        <p className="muted">
          {title} 학습을 완료했어요. 틀린 문제는 오답노트에서 다시 만나요.
        </p>
        <div className="result-metrics">
          <div>
            <strong>
              {correctCount}
              <small> / {results.length}</small>
            </strong>
            <span>정답 문항</span>
          </div>
          <div>
            <strong>
              {Math.round((correctCount / results.length) * 100)}
              <small>%</small>
            </strong>
            <span>정답률</span>
          </div>
          <div>
            <strong>
              {formatTime(
                results.reduce((sum, item) => sum + item.elapsedSeconds, 0),
              )}
            </strong>
            <span>총 풀이 시간</span>
          </div>
        </div>
        <div className="result-review">
          {results.map((result) => (
            <div key={result.attemptId}>
              <span
                className={
                  result.correct
                    ? 'answer-status correct'
                    : 'answer-status wrong'
                }
              >
                {result.correct ? '정답' : '오답'}
              </span>
              <span>
                {questions.find((q) => q.id === result.questionId)?.subtype}
              </span>
              <small>{formatTime(result.elapsedSeconds)}</small>
            </div>
          ))}
        </div>
        <button className="button primary" onClick={onClose}>
          문제은행으로 돌아가기 <Icon name="arrow" size={17} />
        </button>
      </section>
    );

  return (
    <section className="quiz-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FOCUS MODE</p>
          <h1>{title}</h1>
        </div>
        <button
          className="button secondary"
          onClick={onClose}
          disabled={pending}
        >
          학습 종료
        </button>
      </div>
      <div className="quiz-layout">
        <article className="card question-card">
          <div className="question-top">
            <div className="question-badges">
              <span
                className={`tag ${tracks.find((t) => t.id === question.track)?.color}`}
              >
                {tracks.find((t) => t.id === question.track)?.short}
              </span>
              <span className="tag neutral">{question.area}</span>
              <span className="subtle">{question.id}</span>
            </div>
            <span className="timer">
              <Icon name="clock" size={17} /> {formatTime(elapsed)}
            </span>
          </div>
          <h2 ref={heading} tabIndex={-1}>
            <span className="question-number">
              Q{String(index + 1).padStart(2, '0')}.
            </span>{' '}
            {question.prompt}
          </h2>
          <div className="passage">{question.passage}</div>
          <fieldset className="choices" disabled={pending || Boolean(grade)}>
            <legend className="sr-only">정답 선택</legend>
            {question.choices.map((choice, i) => (
              <label
                key={choice.id}
                className={`choice ${selected === choice.id ? 'selected' : ''} ${grade?.answerId === choice.id ? 'is-correct' : ''} ${grade && selected === choice.id && !grade.correct ? 'is-wrong' : ''}`}
              >
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  value={choice.id}
                  checked={selected === choice.id}
                  onChange={() => {
                    setSelected(choice.id);
                    attemptKey.current = null;
                  }}
                />
                <span className="choice-marker">{i + 1}</span>
                <span>{choice.text}</span>
                {grade?.answerId === choice.id && (
                  <span className="choice-verdict">
                    정답 <Icon name="check" size={16} />
                  </span>
                )}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
          {grade && (
            <div
              className={`answer-explanation ${grade.correct ? 'success' : ''}`}
              role="status"
            >
              <h3>
                <Icon name={grade.correct ? 'check' : 'info'} />
                {grade.correct
                  ? '정답이에요. 잘했어요!'
                  : '괜찮아요, 해설로 한 번 더 이해해 봐요.'}
              </h3>
              <p>{grade.explanation}</p>
              {!grade.correct && (
                <p className="feedback-detail">선택한 보기: {grade.feedback}</p>
              )}
            </div>
          )}
          <AiHint
            key={question.id}
            questionId={question.id}
            signedIn={signedIn}
            ready={aiReady}
          />
          <div className="question-footer">
            <span className="subtle">
              자체 제작 연습문제 · 난이도{' '}
              {question.difficulty === 'easy' ? '기초' : '보통'}
            </span>
            {grade ? (
              <button className="button primary" onClick={nextQuestion}>
                {index === questions.length - 1
                  ? '학습 결과 보기'
                  : '다음 문제'}
                <Icon name="arrow" size={17} />
              </button>
            ) : (
              <button
                className="button primary"
                onClick={checkAnswer}
                disabled={!selected || pending}
              >
                {pending ? '채점 중…' : '정답 확인'}
                <Icon name="check" size={17} />
              </button>
            )}
          </div>
        </article>
        <aside className="quiz-aside">
          <div className="card">
            <p className="eyebrow">MY SESSION</p>
            <h3>차근차근 풀어보세요</h3>
            <p className="muted">
              {index + 1} / {questions.length} 문항
            </p>
            <div className="progress-track">
              <span
                style={{
                  width: `${(results.length / questions.length) * 100}%`,
                }}
              />
            </div>
            <div className="question-dots">
              {questions.map((q, i) => (
                <span
                  className={
                    i === index
                      ? 'current'
                      : results[i]
                        ? results[i].correct
                          ? 'done'
                          : 'missed'
                        : ''
                  }
                  key={q.id}
                  aria-label={`${i + 1}번 ${results[i] ? (results[i].correct ? '정답' : '오답') : i === index ? '풀이 중' : '미풀이'}`}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <div className="session-tally">
              <span>
                정답 <b>{correctCount}</b>
              </span>
              <span>
                오답 <b>{results.length - correctCount}</b>
              </span>
            </div>
          </div>
          <div className="study-tip">
            <Icon name="spark" />
            <p>
              빠른 정답보다 중요한 건<br />
              <strong>왜 틀렸는지 이해하는 것.</strong>
            </p>
            <small>
              {signedIn
                ? '각 문항을 채점하면 내 계정의 학습 기록에 저장돼요.'
                : '각 문항을 채점하면 이 브라우저의 학습 기록에 저장돼요.'}
            </small>
          </div>
        </aside>
      </div>
    </section>
  );
}
