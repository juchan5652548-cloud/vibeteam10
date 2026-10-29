'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Icon } from './practice-icons';

type Message = { role: 'user' | 'assistant'; text: string };
const hintResponse = z.object({
  text: z.string().min(1).max(5000),
  model: z.string(),
});

export default function AiHint({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState('');
  const active = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => () => active.current?.abort(), []);

  async function ask(value = message) {
    const question = value.trim();
    if (!question || question.length > 300 || locked.current) return;
    locked.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    active.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 29_000);
    try {
      const response = await fetch('/api/practice/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          message: question,
          history: history
            .slice(-4)
            .map((item) => ({ ...item, text: item.text.slice(0, 1800) })),
        }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).safeParse(body);
        throw new Error(
          failure.success
            ? failure.data.error
            : 'AI 답변을 받지 못했어요. 다시 시도해 주세요.',
        );
      }
      const result = hintResponse.parse(body);
      setHistory(
        (current) =>
          [
            ...current,
            { role: 'user', text: question },
            { role: 'assistant', text: result.text },
          ].slice(-10) as Message[],
      );
      setModel(result.model);
      setMessage('');
    } catch (cause) {
      setMessage(question);
      setError(
        controller.signal.aborted
          ? '답변이 지연되고 있어요. 질문을 다시 보내 주세요.'
          : cause instanceof Error
            ? cause.message
            : '연결을 확인한 뒤 다시 시도해 주세요.',
      );
    } finally {
      window.clearTimeout(timeout);
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <section className="ai-hint-panel">
      <button
        className="ai-hint-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`hint-${questionId}`}
      >
        <span className="ai-toggle-icon">
          <Icon name="spark" size={20} />
        </span>
        <span>
          <strong>AI한테 물어보기</strong>
          <small>
            AI 연결 준비 중 · 지금은 채점 후 문제 해설을 확인해 주세요.
          </small>
        </span>
        <span className="ai-toggle-label">
          {open ? '접기 −' : '힌트 열기 +'}
        </span>
      </button>
      {open && (
        <div id={`hint-${questionId}`} className="ai-hint-body">
          <div className="ai-first-message">
            <span className="ai-avatar">
              <Icon name="spark" size={17} />
            </span>
            <p>
              어디서 막혔나요?
              <br />
              <strong>
                API 연결이 완료되면 이곳에서 풀이 방향을 질문할 수 있어요.
              </strong>
            </p>
          </div>
          {history.length === 0 && (
            <div className="hint-suggestions">
              {[
                '어디서부터 시작하면 좋을까?',
                '어떤 개념이 필요한지 알려줘',
              ].map((text) => (
                <button
                  key={text}
                  disabled={pending}
                  onClick={() => {
                    setMessage(text);
                    void ask(text);
                  }}
                >
                  {text}
                  <Icon name="arrow" size={13} />
                </button>
              ))}
            </div>
          )}
          <div className="hint-messages" aria-live="polite">
            {history.map((item, i) => (
              <div key={i} className={`hint-message ${item.role}`}>
                <span>
                  {item.role === 'assistant' ? 'JOBFIT AI' : '나의 질문'}
                </span>
                <p>{item.text}</p>
              </div>
            ))}
            {pending && (
              <p className="ai-thinking">
                <span />
                문제를 살펴보고 있어요. 잠시만 기다려 주세요…
              </p>
            )}
          </div>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
          <form
            className="hint-form"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor={`hint-input-${questionId}`}>
              AI에게 질문하기
            </label>
            <textarea
              id={`hint-input-${questionId}`}
              placeholder="예: 이 문제에서는 왜 가중평균을 사용하나요?"
              maxLength={300}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={pending}
              rows={2}
            />
            <div>
              <span>{message.length} / 300</span>
              <button
                type="submit"
                className="button primary"
                disabled={!message.trim() || pending}
              >
                {pending ? '답변 기다리는 중…' : 'AI에게 질문하기'}
                <Icon name="arrow" size={15} />
              </button>
            </div>
          </form>
          <p className="ai-disclosure">
            연결 후 질문과 현재 문제, 최근 대화가 OpenAI에 전송돼요. 개인정보는
            적지 마세요. AI 힌트는 틀릴 수 있어요. 최종 답은 문제 해설로
            확인하세요.{model && <span>응답 모델: {model}</span>}
          </p>
        </div>
      )}
    </section>
  );
}
