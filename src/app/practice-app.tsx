'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePracticeAccount } from './use-practice-account';
import AccountDialog from './account-dialog';
import {
  formatTime,
  koreaDay,
  tracks,
  type Attempt,
  type PageView,
  type PublicQuestion,
  type Track,
} from '@/lib/practice-types';
import { Icon, type IconName } from './practice-icons';
import PracticeQuiz from './practice-quiz';

const navigation: { id: PageView; label: string; icon: IconName }[] = [
  { id: 'home', label: '학습 대시보드', icon: 'grid' },
  { id: 'bank', label: '전체 문제은행', icon: 'book' },
  { id: 'mistakes', label: '나의 오답노트', icon: 'file' },
  { id: 'bookmarks', label: '북마크', icon: 'bookmark' },
  { id: 'stats', label: '학습 분석', icon: 'chart' },
];
const trackIcon: Record<Track, IconName> = {
  enterprise: 'building',
  public_ncs: 'book',
  hospital: 'hospital',
};
function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function subscribeDay(notify: () => void) {
  const timer = window.setInterval(notify, 60_000);
  window.addEventListener('focus', notify);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', notify);
  };
}
const getToday = () => koreaDay(new Date().toISOString());
const getServerToday = () => '';

export default function PracticeApp({
  questions,
  initialView = 'home',
}: {
  questions: PublicQuestion[];
  initialView?: PageView;
}) {
  const account = usePracticeAccount();
  const { progress } = account;
  const [authDialog, setAuthDialog] = useState<'login' | 'password' | null>(
    null,
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [view, setView] = useState<PageView>(initialView);
  const [track, setTrack] = useState<Track | 'all'>('all');
  const [area, setArea] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<{
    questions: PublicQuestion[];
    title: string;
    key: string;
  } | null>(null);
  const byId = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );
  const attempts = useMemo(
    () => progress.attempts.filter((a) => byId.has(a.questionId)),
    [progress.attempts, byId],
  );
  const latest = useMemo(
    () => new Map(attempts.map((attempt) => [attempt.questionId, attempt])),
    [attempts],
  );
  const wrongQuestions = questions.filter(
    (q) => latest.get(q.id)?.correct === false,
  );
  const correctCount = attempts.filter((a) => a.correct).length;
  const accuracy = attempts.length
    ? Math.round((correctCount / attempts.length) * 100)
    : null;
  const totalSeconds = attempts.reduce((sum, a) => sum + a.elapsedSeconds, 0);
  const today = useSyncExternalStore(subscribeDay, getToday, getServerToday);
  const todayCount = attempts.filter(
    (a) => koreaDay(a.completedAt) === today,
  ).length;
  const areas = Array.from(
    new Set(
      questions
        .filter((q) => track === 'all' || q.track === track)
        .map((q) => q.area),
    ),
  );
  const areaStats = Array.from(new Set(questions.map((q) => q.area))).map(
    (name) => {
      const records = attempts.filter(
        (a) => byId.get(a.questionId)?.area === name,
      );
      return {
        name,
        total: records.length,
        correct: records.filter((a) => a.correct).length,
        rate: records.length
          ? Math.round(
              (records.filter((a) => a.correct).length / records.length) * 100,
            )
          : null,
      };
    },
  );
  const weakest = areaStats
    .filter((a) => a.total >= 3)
    .sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100))[0];
  const recommended = weakest
    ? questions
        .filter(
          (q) => q.area === weakest.name && latest.get(q.id)?.correct !== true,
        )
        .slice(0, 3)
    : questions.filter((q) => !latest.has(q.id)).slice(0, 3);
  const visibleQuestions = questions.filter((q) => {
    if (view === 'mistakes' && latest.get(q.id)?.correct !== false)
      return false;
    if (view === 'bookmarks' && !progress.bookmarks.includes(q.id))
      return false;
    return (
      (track === 'all' || q.track === track) &&
      (area === 'all' || q.area === area) &&
      (difficulty === 'all' || q.difficulty === difficulty) &&
      `${q.id} ${q.prompt} ${q.passage} ${q.area} ${q.subtype}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  });

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      if (query.has('reset')) setAuthDialog('password');
      if (query.has('login')) setAuthDialog('login');
      if (query.has('auth_error')) {
        setAuthDialog('login');
        setToast(
          '인증 링크가 만료됐거나 다른 브라우저에서 열렸어요. 다시 로그인하거나 메일을 재요청해 주세요.',
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  function navigate(next: PageView) {
    setView(next);
    setSession(null);
    setTrack('all');
    setArea('all');
    setDifficulty('all');
    setSearch('');
    setVisibleCount(12);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function chooseTrack(id: Track) {
    navigate('bank');
    setTrack(id);
  }
  function startPractice(items: PublicQuestion[], title: string) {
    if (!account.ready) {
      setToast(
        account.error || '학습 기록을 불러오고 있어요. 잠시만 기다려 주세요.',
      );
      return;
    }
    if (!items.length) {
      setToast('선택한 조건에 해당하는 문제가 없어요. 필터를 바꿔 주세요.');
      return;
    }
    setSession({ questions: items, title, key: crypto.randomUUID() });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function diagnostic() {
    startPractice(
      shuffle(
        tracks.flatMap((t) =>
          shuffle(questions.filter((q) => q.track === t.id)).slice(0, 2),
        ),
      ),
      '6문항 빠른 진단',
    );
  }
  function recordAttempt(attempt: Attempt) {
    if (!account.recordAttempt(attempt))
      setToast(
        '이 브라우저에서 기록을 저장할 수 없어요. 저장 공간 또는 브라우저 설정을 확인해 주세요.',
      );
  }
  async function toggleBookmark(id: string) {
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    const ok = await account.bookmark(id, !progress.bookmarks.includes(id));
    setBookmarkBusy(false);
    if (!ok)
      setToast(
        '북마크를 저장하지 못했어요. 연결과 로그인 상태를 확인해 주세요.',
      );
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('LOGOUT_FAILED');
      try {
        window.localStorage.removeItem('jobfit-auth-event');
        window.localStorage.setItem('jobfit-auth-event', 'changed');
      } catch {
        /* Logout still clears this tab without localStorage. */
      }
      window.history.replaceState(null, '', '/');
      window.location.reload();
    } catch {
      setToast('로그아웃하지 못했어요. 다시 시도해 주세요.');
      setLoggingOut(false);
    }
  }
  const metricCards = [
    {
      icon: 'book' as const,
      label: '누적 풀이',
      value: attempts.length.toString(),
      unit: '문항',
      detail: `${latest.size}개의 서로 다른 문제`,
      color: 'purple',
    },
    {
      icon: 'target' as const,
      label: '나의 정답률',
      value: accuracy === null ? '—' : accuracy.toString(),
      unit: accuracy === null ? '' : '%',
      detail: attempts.length
        ? `${correctCount}문항 정답 · 전체 풀이 기준`
        : '첫 문제를 풀어보세요',
      color: 'blue',
    },
    {
      icon: 'clock' as const,
      label: '누적 학습 시간',
      value: Math.floor(totalSeconds / 60).toString(),
      unit: '분',
      detail: totalSeconds
        ? formatTime(totalSeconds)
        : '나만의 학습 리듬을 만들어요',
      color: 'mint',
    },
    {
      icon: 'file' as const,
      label: '복습할 오답',
      value: wrongQuestions.length.toString(),
      unit: '문항',
      detail: '다시 맞히면 오답노트에서 해결돼요',
      color: 'peach',
    },
  ];
  const metrics = (
    <section className="metrics-grid" aria-label="나의 학습 현황">
      {metricCards.map((metric) => (
        <div className="metric-card card" key={metric.label}>
          <div className="metric-title">
            <span>{metric.label}</span>
            <span className={`metric-icon ${metric.color}`}>
              <Icon name={metric.icon} size={19} />
            </span>
          </div>
          <div className="metric-value">
            {metric.value}
            <span>{metric.unit}</span>
          </div>
          <small>{metric.detail}</small>
        </div>
      ))}
    </section>
  );

  function renderQuestions(items: PublicQuestion[]) {
    return (
      <div className="question-list">
        {items.map((q) => {
          const kind = tracks.find((t) => t.id === q.track)!;
          const last = latest.get(q.id);
          return (
            <article key={q.id} className="question-row">
              <button
                className={`bookmark-button ${progress.bookmarks.includes(q.id) ? 'saved' : ''}`}
                aria-label={`${q.id} 북마크 ${progress.bookmarks.includes(q.id) ? '해제' : '추가'}`}
                aria-pressed={progress.bookmarks.includes(q.id)}
                onClick={() => toggleBookmark(q.id)}
              >
                <Icon name="bookmark" size={19} />
              </button>
              <button
                className="question-row-main"
                onClick={() =>
                  startPractice([q], `${kind.short} · ${q.subtype}`)
                }
              >
                <div className="row-tags">
                  <span className={`tag ${kind.color}`}>{kind.short}</span>
                  <span>{q.area}</span>
                  <span className="dot-separator">·</span>
                  <span>{q.subtype}</span>
                </div>
                <h3>{q.prompt}</h3>
                <p>
                  {q.passage.replaceAll('\n', ' ').slice(0, 100)}
                  {q.passage.length > 100 ? '…' : ''}
                </p>
              </button>
              <div className="question-row-end">
                <span className={`level ${q.difficulty}`}>
                  {q.difficulty === 'easy' ? '기초' : '보통'}
                </span>
                {last && (
                  <span
                    className={`last-result ${last.correct ? 'right' : 'wrong'}`}
                  >
                    {last.correct ? '풀이 완료' : '복습 필요'}
                  </span>
                )}
                <button
                  className="row-arrow"
                  aria-label={`${q.id} 문제 풀기`}
                  onClick={() =>
                    startPractice([q], `${kind.short} · ${q.subtype}`)
                  }
                >
                  <Icon name="arrow" size={19} />
                </button>
              </div>
              {view === 'mistakes' && last && !last.correct && (
                <details className="review-details">
                  <summary>내가 고른 답과 해설 보기</summary>
                  <p className="chosen-answer">
                    내 답:{' '}
                    {
                      q.choices.find((choice) => choice.id === last.choiceId)
                        ?.text
                    }
                  </p>
                  <p className="correct-answer">
                    정답:{' '}
                    {
                      q.choices.find((choice) => choice.id === last.answerId)
                        ?.text
                    }
                  </p>
                  <p>{last.explanation}</p>
                  <p>{last.feedback}</p>
                  <small>
                    풀이 시간 {formatTime(last.elapsedSeconds)} ·{' '}
                    {new Intl.DateTimeFormat('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(last.completedAt))}
                  </small>
                </details>
              )}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate('home')}
          aria-label="JOBFIT AI 홈"
        >
          <span className="brand-mark">
            <Icon name="bolt" size={23} />
          </span>
          <span>
            JOBFIT<span className="brand-ai">AI</span>
          </span>
        </button>
        <div className="sidebar-label">MY WORKSPACE</div>
        <nav aria-label="학습 메뉴">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id && !session ? 'active' : ''}`}
              aria-current={view === item.id && !session ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.id === 'mistakes' && wrongQuestions.length > 0 && (
                <small>{wrongQuestions.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-spark">
              <Icon name="spark" size={19} />
            </span>
            <h3>꾸준함이 실력이 되는 곳</h3>
            <p>
              오늘의 한 문제가
              <br />
              내일의 자신감이 돼요.
            </p>
            <button onClick={diagnostic}>
              오늘의 학습 시작 <Icon name="arrow" size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${view === 'guide' ? 'active' : ''}`}
            onClick={() => navigate('guide')}
          >
            <Icon name="info" size={18} />
            이용 안내
          </button>
          <div className="sidebar-foot">
            취업의 다음 단계, JOBFIT AI<span>YOUR NEXT STEP STARTS HERE</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            내 학습 공간 <span>/</span>{' '}
            <strong>
              {session
                ? '집중 학습'
                : (navigation.find((item) => item.id === view)?.label ??
                  '이용 안내')}
            </strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Icon name="search" size={17} />
              <input
                aria-label="문제 검색"
                placeholder="어떤 문제를 찾고 있나요?"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setView('bank');
                  setSession(null);
                  setVisibleCount(12);
                }}
              />
              <kbd>검색</kbd>
            </label>
            <div className="account-actions">
              <button
                className="guest-profile"
                onClick={() =>
                  account.user ? navigate('stats') : setAuthDialog('login')
                }
                aria-label={
                  account.user ? '내 계정 학습 기록 보기' : '로그인 및 회원가입'
                }
              >
                <span>
                  <Icon name="user" size={19} />
                </span>
                <div>
                  {account.user ? '나의 계정' : '로그인'}
                  <small>
                    {account.user
                      ? '계정에 학습 기록 저장 중'
                      : '회원가입하고 기록 이어가기'}
                  </small>
                </div>
              </button>
              {account.user && (
                <button
                  className="logout-button"
                  disabled={loggingOut}
                  onClick={() => void logout()}
                >
                  {loggingOut ? '처리 중…' : '로그아웃'}
                </button>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {!account.ready && (
            <p className="account-banner" role="status">
              {account.error || '로그인 상태와 학습 기록을 확인하고 있어요…'}
              {account.error && (
                <button
                  className="text-button"
                  onClick={() => window.location.reload()}
                >
                  다시 불러오기
                </button>
              )}
            </p>
          )}
          {account.ready &&
            !account.user &&
            (view === 'mistakes' || view === 'stats') && (
              <div className="account-banner">
                지금은 이 브라우저의 게스트 기록이에요. 로그인 후 푼 문제는
                계정에 저장돼요.{' '}
                <button
                  className="text-button"
                  onClick={() => setAuthDialog('login')}
                >
                  로그인 / 회원가입
                </button>
              </div>
            )}
          {session ? (
            <PracticeQuiz
              key={session.key}
              questions={session.questions}
              title={session.title}
              onAttempt={recordAttempt}
              onClose={() => navigate('bank')}
              signedIn={Boolean(account.user)}
              aiReady={account.aiReady}
            />
          ) : view === 'home' ? (
            <>
              <div className="welcome-row">
                <div>
                  <p className="eyebrow">MAKE TODAY COUNT</p>
                  <h1>
                    반가워요, 오늘도 한 걸음 나아가 볼까요?{' '}
                    <span className="wave">✦</span>
                  </h1>
                  <p className="muted">
                    문제 풀이부터 약점 복습까지, 나에게 맞는 취업 준비를
                    시작해요.
                  </p>
                </div>
                <span className="status-pill">
                  <span /> 나만의 학습 공간
                </span>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-label">
                    <Icon name="spark" size={15} /> 작은 시작, 확실한 성장
                  </span>
                  <h2>
                    합격에 가까워지는 습관,
                    <br />
                    오늘의 한 문제부터.
                  </h2>
                  <p>
                    대기업부터 공기업, 병원까지.
                    <br />
                    목표에 맞는 문제를 풀고, 부족한 부분을 채워보세요.
                  </p>
                  <div className="hero-buttons">
                    <button
                      className="button hero-primary"
                      onClick={diagnostic}
                    >
                      빠른 진단 시작하기 <Icon name="arrow" size={18} />
                    </button>
                    <button
                      className="hero-secondary"
                      onClick={() => navigate('bank')}
                    >
                      문제은행 둘러보기 <Icon name="chevron" size={15} />
                    </button>
                  </div>
                  <small>3개 분야 · 6문항으로 가볍게 시작해요</small>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <span className="art-star star-one">✦</span>
                  <span className="art-star star-two">✦</span>
                  <div className="floating-card card-back">
                    <span>YOUR NEXT STEP</span>
                    <div className="art-lines">
                      <i />
                      <i />
                      <i />
                    </div>
                    <span className="art-check">
                      <Icon name="check" size={18} />
                    </span>
                  </div>
                  <div className="floating-card card-front">
                    <span className="art-kicker">TODAY&apos;S CHALLENGE</span>
                    <div className="art-ring">
                      <span>
                        <Icon name="target" size={33} />
                        <strong>한 걸음 더</strong>
                      </span>
                    </div>
                    <div className="art-card-bottom">
                      <span>오늘의 나를 넘어서</span>
                      <Icon name="arrow" size={18} />
                    </div>
                  </div>
                  <div className="floating-badge">
                    <span>
                      <Icon name="check" size={16} />
                    </span>
                    시작하는 당신을 응원해요
                  </div>
                </div>
              </section>
              {metrics}
              <section>
                <div className="section-heading">
                  <div>
                    <h2>어떤 목표를 준비하고 있나요?</h2>
                    <p className="muted">
                      지원 분야에 맞춰 필요한 역량을 연습해요.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate('bank')}
                  >
                    전체 문제 보기 <Icon name="chevron" size={15} />
                  </button>
                </div>
                <div className="track-grid">
                  {tracks.map((item, i) => (
                    <button
                      key={item.id}
                      className={`track-card ${item.color}`}
                      onClick={() => chooseTrack(item.id)}
                    >
                      <div className="track-card-top">
                        <span className="track-icon">
                          <Icon name={trackIcon[item.id]} size={27} />
                        </span>
                        <span className="track-index">0{i + 1}</span>
                      </div>
                      <h3>{item.name}</h3>
                      <p>{item.description}</p>
                      <div className="track-tags">
                        {item.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      <div className="track-card-bottom">
                        <span>
                          <strong>
                            {
                              questions.filter((q) => q.track === item.id)
                                .length
                            }
                          </strong>
                          개 연습문제
                        </span>
                        <span className="circle-arrow">
                          <Icon name="arrow" size={18} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <div className="dashboard-bottom">
                <section className="card recommended-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">JUST FOR YOU</p>
                      <h2>
                        {weakest
                          ? `${weakest.name}, 한 번 더 연습해 볼까요?`
                          : '오늘은 이 문제부터 시작해 보세요'}
                      </h2>
                    </div>
                    <span className="soft-label">
                      {weakest ? '풀이 기록 기반' : '첫 학습 추천'}
                    </span>
                  </div>
                  <p className="muted panel-description">
                    {weakest
                      ? `${weakest.total}회 풀이 정답률 ${weakest.rate}%. 아직 표본이 적을 수 있어요.`
                      : '서로 다른 유형을 만나며 나의 강점을 찾아보세요.'}
                  </p>
                  {renderQuestions(
                    recommended.length ? recommended : questions.slice(0, 3),
                  )}
                </section>
                <aside className="card daily-card">
                  <div className="daily-top">
                    <span className="daily-icon">
                      <Icon name="target" size={22} />
                    </span>
                    <span className="subtle">TODAY&apos;S GOAL</span>
                  </div>
                  <h2>하루 5문제의 힘</h2>
                  <p className="muted">
                    작은 목표를 채우며
                    <br />
                    공부의 리듬을 만들어봐요.
                  </p>
                  <div className="daily-goal-count">
                    <strong>{Math.min(todayCount, 5)}</strong>
                    <span>/ 5문항</span>
                  </div>
                  <div className="goal-steps">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span
                        key={i}
                        className={todayCount > i ? 'complete' : ''}
                      >
                        {todayCount > i ? (
                          <Icon name="check" size={16} />
                        ) : (
                          i + 1
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="daily-message">
                    {todayCount >= 5
                      ? '오늘의 목표 달성! 잘했어요.'
                      : `${Math.max(0, 5 - todayCount)}문제만 더 풀면 오늘의 목표 달성!`}
                  </p>
                  <button
                    className="button secondary full-width"
                    onClick={() =>
                      startPractice(
                        shuffle(questions).slice(
                          0,
                          todayCount >= 5 ? 5 : 5 - todayCount,
                        ),
                        '오늘의 5문제',
                      )
                    }
                  >
                    지금 문제 풀기 <Icon name="arrow" size={17} />
                  </button>
                </aside>
              </div>
            </>
          ) : view === 'stats' ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MY LEARNING INSIGHTS</p>
                  <h1>기록이 쌓이면, 방향이 보여요.</h1>
                  <p className="muted">
                    {account.user
                      ? '내 계정의 최근 500회 풀이 기록을 분석해요.'
                      : '이 브라우저에서 푼 최근 500회 기록을 분석해요.'}
                  </p>
                </div>
                <button className="button primary" onClick={diagnostic}>
                  진단 문제 풀기 <Icon name="arrow" size={17} />
                </button>
              </div>
              {metrics}
              <div className="analysis-grid">
                <section className="card analysis-card">
                  <div className="panel-heading">
                    <h2>영역별 정답률</h2>
                    <span className="subtle">풀이 횟수 기준</span>
                  </div>
                  <div className="area-bars">
                    {areaStats.map((item) => (
                      <div key={item.name}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {item.total
                              ? `${item.correct}/${item.total}문항 · ${item.rate}%`
                              : '아직 풀이 전'}
                          </span>
                        </div>
                        <div className="progress-track">
                          <span style={{ width: `${item.rate ?? 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card analysis-card">
                  <p className="eyebrow">NEXT STEP</p>
                  <h2>
                    {weakest
                      ? `${weakest.name} 연습을 추천해요`
                      : '먼저 여러 유형을 만나보세요'}
                  </h2>
                  <p className="muted analysis-copy">
                    {weakest
                      ? '3회 이상 풀이한 영역 중 정답률이 가장 낮은 영역이에요. 풀이 시간이 길었다는 이유만으로 약점이라고 판단하지 않아요.'
                      : '영역별로 3문항 이상 풀면 정답률에 따라 다음 학습을 추천해요. 지금은 학습 기록을 쌓는 단계예요.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      startPractice(
                        shuffle(
                          weakest
                            ? questions.filter((q) => q.area === weakest.name)
                            : questions,
                        ).slice(0, 5),
                        weakest
                          ? `${weakest.name} 집중 연습`
                          : '다양한 유형 연습',
                      )
                    }
                  >
                    추천 학습 시작 <Icon name="arrow" size={17} />
                  </button>
                  <div className="analysis-note">
                    <Icon name="info" size={17} />
                    <span>
                      이 분석은 정답률을 계산한 학습 요약이에요. AI 모델
                      분석이나 합격 가능성 예측이 아니에요.
                    </span>
                  </div>
                </section>
              </div>
              <section className="card analysis-card">
                <div className="panel-heading">
                  <h2>최근 학습 기록</h2>
                  <span className="subtle">최근 10회</span>
                </div>
                {!attempts.length ? (
                  <div className="empty-state">
                    <Icon name="chart" size={33} />
                    <h3>첫 기록을 기다리고 있어요</h3>
                    <p>문제를 풀고 정답을 확인하면 이곳에 기록돼요.</p>
                  </div>
                ) : (
                  <div className="history-list">
                    {[...attempts]
                      .reverse()
                      .slice(0, 10)
                      .map((a) => (
                        <div key={a.attemptId}>
                          <span
                            className={`answer-status ${a.correct ? 'correct' : 'wrong'}`}
                          >
                            {a.correct ? '정답' : '오답'}
                          </span>
                          <strong>{byId.get(a.questionId)?.subtype}</strong>
                          <span>{formatTime(a.elapsedSeconds)}</span>
                          <small>
                            {new Intl.DateTimeFormat('ko-KR', {
                              timeZone: 'Asia/Seoul',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(a.completedAt))}
                          </small>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </>
          ) : view === 'guide' ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">WELCOME TO JOBFIT</p>
                  <h1>나에게 맞는 준비를 시작하는 방법</h1>
                  <p className="muted">
                    문제를 풀고, 이해하고, 다시 도전하세요.
                  </p>
                </div>
              </div>
              <div className="guide-grid">
                {[
                  {
                    n: '01',
                    title: '분야와 유형을 선택해요',
                    text: '대기업 공통 인적성, 공기업 NCS, 병원 업무 기초역량 중 목표에 맞는 분야를 골라요.',
                  },
                  {
                    n: '02',
                    title: '풀고 바로 이해해요',
                    text: '답을 선택하면 서버에서 채점하고 정답과 해설을 알려줘요. 오답은 다시 풀어 해결할 수 있어요.',
                  },
                  {
                    n: '03',
                    title: '기록으로 방향을 찾아요',
                    text: '영역별 정답률과 풀이 시간으로 학습을 돌아보세요. 로그인하면 기록과 북마크가 내 계정에 저장돼요.',
                  },
                ].map((item) => (
                  <article className="card guide-card" key={item.n}>
                    <span>{item.n}</span>
                    <h2>{item.title}</h2>
                    <p className="muted">{item.text}</p>
                  </article>
                ))}
              </div>
              <section className="card guide-details">
                <h2>문제와 학습 기록 안내</h2>
                <ul>
                  <li>
                    현재 36개 문항은 JOBFIT AI 자체 연습문제예요. 실제
                    기출·복원·기업이나 병원의 공식 문제는 아니에요.
                  </li>
                  <li>
                    대기업은 공통 수리·자료해석·추리 유형이며 특정 기업의 시험
                    구성이나 난이도를 재현하지 않아요.
                  </li>
                  <li>
                    병원 문제는 비임상 업무 기초역량이에요. 간호학·의료
                    전공시험이나 인성검사를 대체하지 않아요.
                  </li>
                  <li>
                    난이도는 출제자 임시 분류이며 전문가 검수와 실제 응시자 보정
                    전이에요.
                  </li>
                  <li>
                    로그인하면 풀이 기록과 북마크가 내 계정에 저장돼요. 게스트
                    기록은 이 브라우저에만 남으며 자동으로 계정에 합쳐지지
                    않아요. 로그인·로그아웃하면 표시할 기록을 전환해요.
                  </li>
                  <li>
                    북마크와 최근 500회 풀이 기록을 저장해요. 같은 문제를 여러
                    번 풀면 풀이 횟수에 각각 반영돼요.
                  </li>
                </ul>
                <div className="source-links">
                  <a
                    href="https://www.ncs.go.kr/blind/rh13/bbs_lib_list.do?libDstinCd=48&menuId=MN42030204"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NCS 공식 예시자료 <Icon name="arrow" size={15} />
                  </a>
                  <a
                    href="https://github.com/juchan5652548-cloud/vibeteam10/tree/main/research/aptitude"
                    target="_blank"
                    rel="noreferrer"
                  >
                    문제 유형 조사와 출처 <Icon name="arrow" size={15} />
                  </a>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="section-heading bank-heading">
                <div>
                  <p className="eyebrow">
                    {view === 'mistakes'
                      ? 'LEARN FROM EVERY TRY'
                      : view === 'bookmarks'
                        ? 'SAVED FOR LATER'
                        : 'FIND YOUR NEXT CHALLENGE'}
                  </p>
                  <h1>
                    {view === 'mistakes'
                      ? '다시 풀면, 내 실력이 돼요.'
                      : view === 'bookmarks'
                        ? '다시 만나고 싶은 문제들'
                        : track === 'all'
                          ? '목표에 맞게, 나의 문제은행'
                          : `${tracks.find((item) => item.id === track)?.name} 문제은행`}
                  </h1>
                  <p className="muted">
                    {view === 'mistakes'
                      ? '마지막 풀이에서 틀린 문제예요. 정답을 맞히면 오답노트에서 해결돼요.'
                      : view === 'bookmarks'
                        ? '북마크한 문제를 모아 집중해서 연습해요.'
                        : '필요한 유형만 골라 나만의 학습을 만들어보세요.'}
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={!visibleQuestions.length}
                  onClick={() =>
                    startPractice(
                      shuffle(visibleQuestions).slice(0, 5),
                      view === 'mistakes'
                        ? '오답 집중 복습'
                        : '선택 분야 5문제 연습',
                    )
                  }
                >
                  {view === 'mistakes' ? '오답 복습 시작' : '5문제 연습하기'}{' '}
                  <Icon name="arrow" size={17} />
                </button>
              </div>
              <section className="card bank-panel">
                <div className="track-tabs" aria-label="문제 분야">
                  <button
                    className={track === 'all' ? 'active' : ''}
                    onClick={() => {
                      setTrack('all');
                      setArea('all');
                      setVisibleCount(12);
                    }}
                  >
                    전체 분야
                  </button>
                  {tracks.map((item) => (
                    <button
                      key={item.id}
                      className={track === item.id ? 'active' : ''}
                      onClick={() => {
                        setTrack(item.id);
                        setArea('all');
                        setVisibleCount(12);
                      }}
                    >
                      <Icon name={trackIcon[item.id]} size={17} />
                      {item.name}
                    </button>
                  ))}
                </div>
                {view === 'bank' && track !== 'all' && (
                  <div className="part-overview">
                    <p>
                      {tracks.find((item) => item.id === track)?.description}
                    </p>
                    <div
                      className="part-areas"
                      aria-label="파트별 영역 바로 선택"
                    >
                      {areas.map((name) => (
                        <button
                          key={name}
                          className={area === name ? 'selected' : ''}
                          aria-pressed={area === name}
                          onClick={() => {
                            setArea(area === name ? 'all' : name);
                            setVisibleCount(12);
                          }}
                        >
                          {name}
                          <span>
                            {
                              questions.filter(
                                (q) => q.track === track && q.area === name,
                              ).length
                            }
                            문항
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="filter-row">
                  <label className="bank-search">
                    <Icon name="search" size={18} />
                    <input
                      aria-label="문제은행 검색"
                      placeholder="문제 내용, 유형, 번호로 검색"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setVisibleCount(12);
                      }}
                    />
                  </label>
                  <label>
                    <span className="sr-only">영역</span>
                    <select
                      value={area}
                      onChange={(e) => {
                        setArea(e.target.value);
                        setVisibleCount(12);
                      }}
                    >
                      <option value="all">모든 영역</option>
                      {areas.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">난이도</span>
                    <select
                      value={difficulty}
                      onChange={(e) => {
                        setDifficulty(e.target.value);
                        setVisibleCount(12);
                      }}
                    >
                      <option value="all">모든 난이도</option>
                      <option value="easy">기초</option>
                      <option value="medium">보통</option>
                    </select>
                  </label>
                </div>
                <div className="list-summary">
                  <span>
                    총 <strong>{visibleQuestions.length}</strong>개 문제
                  </span>
                  <span>자체 제작 연습문제</span>
                </div>
                {visibleQuestions.length ? (
                  renderQuestions(visibleQuestions.slice(0, visibleCount))
                ) : (
                  <div className="empty-state">
                    <Icon
                      name={
                        view === 'mistakes'
                          ? 'check'
                          : view === 'bookmarks'
                            ? 'bookmark'
                            : 'search'
                      }
                      size={35}
                    />
                    <h3>
                      {view === 'mistakes'
                        ? '현재 조건에 복습할 오답이 없어요'
                        : view === 'bookmarks'
                          ? '현재 조건에 북마크한 문제가 없어요'
                          : '검색 결과가 없어요'}
                    </h3>
                    <p>
                      {view === 'bookmarks'
                        ? '문제 옆 북마크 아이콘을 눌러 저장해 보세요.'
                        : '다른 분야를 선택하거나 검색 조건을 바꿔보세요.'}
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => navigate('bank')}
                    >
                      전체 문제 둘러보기
                    </button>
                  </div>
                )}
                {visibleQuestions.length > visibleCount && (
                  <div className="load-more">
                    <button
                      className="button secondary"
                      onClick={() => setVisibleCount(visibleCount + 12)}
                    >
                      문제 더 보기{' '}
                      <span>
                        {Math.min(visibleCount, visibleQuestions.length)} /{' '}
                        {visibleQuestions.length}
                      </span>
                    </button>
                  </div>
                )}
              </section>
              <p className="bank-disclaimer">
                <Icon name="info" size={16} />
                실제 기출문제가 아닌 자체 연습문제예요. 유형과 난이도는 이용
                안내를 확인해 주세요.
              </p>
            </>
          )}
          <footer className="page-footer">
            <span>
              © 2026 JOBFIT AI <span className="footer-dot">·</span> 오늘의
              노력이 내일의 기회로.
            </span>
            <button onClick={() => navigate('guide')}>
              {account.user
                ? '학습 기록을 내 계정에 저장해요'
                : '게스트 기록은 이 브라우저에 저장돼요'}{' '}
              <Icon name="info" size={14} />
            </button>
          </footer>
        </main>
      </div>
      {authDialog && (
        <AccountDialog
          initialMode={authDialog}
          googleReady={account.googleReady}
          onClose={() => {
            setAuthDialog(null);
            window.history.replaceState(null, '', '/');
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label="알림 닫기">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
