'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'signup' | 'recover' | 'password';
const schema = z.object({ email: z.string(), password: z.string() });
type Fields = z.infer<typeof schema>;

export default function AccountDialog({
  onClose,
  initialMode = 'login',
}: {
  onClose: () => void;
  initialMode?: Mode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const { isSubmitting } = form.formState;
  useEffect(() => {
    const prior = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (prior instanceof HTMLElement) prior.focus();
    };
  }, []);
  async function submit(fields: Fields) {
    setError('');
    setMessage('');
    if (
      mode !== 'password' &&
      !z.email().max(254).safeParse(fields.email.trim()).success
    ) {
      form.setError('email', {
        message: '올바른 이메일 주소를 입력해 주세요.',
      });
      return;
    }
    if (
      mode !== 'recover' &&
      (fields.password.length < 8 || fields.password.length > 128)
    ) {
      form.setError('password', {
        message: '비밀번호는 8~128자로 입력해 주세요.',
      });
      return;
    }
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode,
          ...(mode !== 'password' ? { email: fields.email.trim() } : {}),
          ...(mode !== 'recover' ? { password: fields.password } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = z
        .object({
          error: z.string().optional(),
          message: z.string().optional(),
          signedIn: z.boolean().optional(),
        })
        .parse(await response.json());
      if (!response.ok) {
        setError(body.error ?? '요청을 처리하지 못했어요.');
        return;
      }
      form.resetField('password');
      if (body.signedIn || mode === 'password') {
        try {
          window.localStorage.removeItem('jobfit-auth-event');
          window.localStorage.setItem('jobfit-auth-event', 'changed');
        } catch {
          /* Cross-tab notification is optional. */
        }
        router.replace('/my');
        router.refresh();
        return;
      }
      setMessage(body.message ?? '완료됐어요.');
    } catch {
      setError('연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.');
    }
  }
  const title =
    mode === 'signup'
      ? '회원가입'
      : mode === 'recover'
        ? '비밀번호 찾기'
        : mode === 'password'
          ? '새 비밀번호 설정'
          : '로그인';
  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-labelledby="account-title"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault();
        else onClose();
      }}
    >
      <div className="account-dialog-top">
        <span className="eyebrow">JOBFIT AI ACCOUNT</span>
        <button
          type="button"
          aria-label="로그인 창 닫기"
          disabled={isSubmitting}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h2 id="account-title">{title}</h2>
      <p className="muted">
        로그인하면 나의 풀이 기록과 오답노트를 다른 기기에서도 이어볼 수 있어요.
      </p>
      {mode !== 'password' && (
        <div className="account-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'selected' : ''}
            disabled={isSubmitting}
            onClick={() => {
              setMode('login');
              setError('');
              setMessage('');
              form.clearErrors();
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'selected' : ''}
            disabled={isSubmitting}
            onClick={() => {
              setMode('signup');
              setError('');
              setMessage('');
              form.clearErrors();
            }}
          >
            회원가입
          </button>
        </div>
      )}
      <form onSubmit={form.handleSubmit(submit)} noValidate>
        {mode !== 'password' && (
          <label htmlFor="account-email">
            이메일
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              disabled={isSubmitting}
              {...form.register('email')}
              aria-invalid={Boolean(form.formState.errors.email)}
              aria-describedby="account-email-error"
            />
            <small id="account-email-error" className="field-error">
              {form.formState.errors.email?.message}
            </small>
          </label>
        )}
        {mode !== 'recover' && (
          <label htmlFor="account-password">
            {mode === 'password' ? '새 비밀번호' : '비밀번호'}
            <input
              id="account-password"
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              maxLength={128}
              disabled={isSubmitting}
              {...form.register('password')}
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby="account-password-error"
            />
            <small id="account-password-error" className="field-error">
              {form.formState.errors.password?.message}
            </small>
          </label>
        )}
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="account-success" role="status">
            {message}
          </p>
        )}
        <button
          className="button primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? '처리 중…' : title}
        </button>
      </form>
      {mode === 'login' && (
        <button
          className="text-button recovery-link"
          disabled={isSubmitting}
          onClick={() => {
            setMode('recover');
            setError('');
            setMessage('');
          }}
        >
          비밀번호를 잊으셨나요?
        </button>
      )}
      <p className="account-disclosure">
        이메일과 비밀번호는 Supabase 인증 서비스에서 처리해요. 게스트 기록은
        계정에 자동 합쳐지지 않으며 이 브라우저에 보존돼요.
      </p>
    </dialog>
  );
}
