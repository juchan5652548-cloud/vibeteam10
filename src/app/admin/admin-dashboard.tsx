'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminReportSchema, type AdminReport } from '@/lib/admin-types';
import { tracks, type Track } from '@/lib/practice-types';

type Filters = {
  page: number;
  search: string;
  track: Track | 'all';
  sort: 'recent' | 'attempts' | 'wrong' | 'accuracy';
};
const number = (value: number) => value.toLocaleString('ko-KR');
const percent = (value: number | null) => (value === null ? '—' : `${value}%`);
const date = (value: string | null) =>
  value === null
    ? '풀이 기록 없음'
    : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value));

export default function AdminDashboard() {
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    search: '',
    track: 'all',
    sort: 'recent',
  });
  const [draft, setDraft] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: AdminReport | null;
    error: string;
  } | null>(null);
  const params = new URLSearchParams({
    ...filters,
    page: String(filters.page),
  }).toString();
  const requestKey = `${params}:${revision}`;
  const loading = result?.key !== requestKey;
  const report = !loading ? result?.data : null;
  const error = !loading ? result?.error : '';

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/learning?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? '로그인이 만료됐습니다. 학습 화면에서 다시 로그인해 주세요.'
              : response.status === 403
                ? '이 계정에는 관리자 권한이 없습니다.'
                : '학습 통계를 불러오지 못했습니다. 다시 시도해 주세요.',
          );
        }
        const data = adminReportSchema.parse(await response.json());
        if (!controller.signal.aborted)
          setResult({ key: requestKey, data, error: '' });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            data: null,
            error:
              failure instanceof Error && failure.name === 'Error'
                ? failure.message
                : '연결이 지연되거나 응답을 확인하지 못했습니다. 다시 시도해 주세요.',
          });
      });
    return () => controller.abort();
  }, [params, requestKey]);

  useEffect(() => {
    const onAuthChange = (event: StorageEvent) => {
      if (event.key === 'jobfit-auth-event') window.location.reload();
    };
    const onReturn = () => setRevision((value) => value + 1);
    window.addEventListener('storage', onAuthChange);
    window.addEventListener('focus', onReturn);
    return () => {
      window.removeEventListener('storage', onAuthChange);
      window.removeEventListener('focus', onReturn);
    };
  }, []);

  const pages = report
    ? Math.max(1, Math.ceil(report.totalUsers / report.pageSize))
    : 1;
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">JOBFIT AI · ADMIN</p>
          <h1>회원 학습 현황</h1>
          <p className="admin-description">
            누가 얼마나 학습했는지, 어떤 부분에서 어려움을 겪는지 확인하세요.
          </p>
        </div>
        <Link className="admin-button" href="/">
          학습 화면으로
        </Link>
      </header>

      <section className="admin-filters card" aria-label="회원 조회 조건">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilters((current) => ({
              ...current,
              page: 1,
              search: draft.trim(),
            }));
          }}
        >
          <label htmlFor="admin-search">회원 검색</label>
          <div className="admin-search">
            <input
              id="admin-search"
              value={draft}
              maxLength={80}
              placeholder="이름 또는 이메일"
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <button className="admin-button primary" type="submit">
              검색
            </button>
          </div>
        </form>
        <label>
          지원 분야
          <select
            value={filters.track}
            onChange={(event) => {
              const track = event.currentTarget.value as Filters['track'];
              setFilters((current) => ({ ...current, page: 1, track }));
            }}
          >
            <option value="all">전체 분야</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          정렬
          <select
            value={filters.sort}
            onChange={(event) => {
              const sort = event.currentTarget.value as Filters['sort'];
              setFilters((current) => ({ ...current, page: 1, sort }));
            }}
          >
            <option value="recent">최근 학습순</option>
            <option value="attempts">많이 푼 순</option>
            <option value="wrong">많이 틀린 순</option>
            <option value="accuracy">높은 정답률순</option>
          </select>
        </label>
        <button
          className="admin-button"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          새로고침
        </button>
      </section>

      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <p className="admin-notice" role="status">
            저장된 학습 기록을 집계하고 있어요…
          </p>
        )}
        {error && (
          <div className="admin-notice error" role="alert">
            <p>{error}</p>
            <button
              className="admin-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              다시 시도
            </button>
          </div>
        )}
      </div>

      {report && (
        <>
          <section
            className="admin-metrics"
            aria-label="검색 조건에 해당하는 회원 전체 요약"
          >
            {[
              [
                '조회 회원',
                `${number(report.totalUsers)}명`,
                `학습 기록이 있는 회원 ${number(report.summary.activeUsers)}명`,
              ],
              [
                '총 풀이',
                `${number(report.summary.attempts)}회`,
                '같은 문제의 반복 풀이 포함',
              ],
              [
                '정답',
                `${number(report.summary.correct)}회`,
                `전체 정답률 ${percent(report.summary.accuracy)}`,
              ],
              [
                '오답',
                `${number(report.summary.wrong)}회`,
                '저장된 오답 제출 횟수',
              ],
            ].map(([label, value, detail]) => (
              <article className="card admin-metric" key={label}>
                <p>{label}</p>
                <strong>{value}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </section>
          <section className="card admin-list" aria-labelledby="admin-members">
            <div className="admin-list-heading">
              <h2 id="admin-members">회원별 학습 기록</h2>
              <span>{number(report.totalUsers)}명 · 페이지당 50명</span>
            </div>
            <div
              className="admin-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="회원별 학습 기록 표, 작은 화면에서는 가로로 이동할 수 있습니다"
            >
              <table>
                <caption className="admin-caption">
                  선택한 분야의 누적 기록 · 최근 학습 시각은 한국 시간
                </caption>
                <thead>
                  <tr>
                    <th scope="col">회원</th>
                    <th scope="col">총 풀이</th>
                    <th scope="col">서로 다른 문제</th>
                    <th scope="col">정답</th>
                    <th scope="col">오답</th>
                    <th scope="col">정답률</th>
                    <th scope="col">최근 학습</th>
                  </tr>
                </thead>
                <tbody>
                  {report.users.map((user) => (
                    <tr key={user.id}>
                      <th scope="row">
                        <span className="admin-member-name">{user.name}</span>
                        <span className="admin-member-email">
                          {user.email || '이메일 없음'}
                        </span>
                      </th>
                      <td>
                        {number(user.attempts)}회
                        {user.ungraded > 0 && (
                          <small className="admin-ungraded">
                            채점 제외 {number(user.ungraded)}회
                          </small>
                        )}
                      </td>
                      <td>{number(user.uniqueQuestions)}개</td>
                      <td>{number(user.correct)}회</td>
                      <td className="admin-wrong">{number(user.wrong)}회</td>
                      <td>
                        <strong>{percent(user.accuracy)}</strong>
                      </td>
                      <td className="admin-last-date">
                        {date(user.lastActiveAt)}
                      </td>
                    </tr>
                  ))}
                  {report.users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="admin-empty">
                        {report.totalUsers === 0
                          ? '조건에 맞는 회원이 없습니다.'
                          : '이 페이지에 표시할 회원이 없습니다. 이전 페이지로 이동해 주세요.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <nav className="admin-pagination" aria-label="회원 목록 페이지">
              <button
                className="admin-button"
                disabled={filters.page <= 1}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page - 1,
                  }))
                }
              >
                이전
              </button>
              <span>
                {filters.page} / {pages}
              </span>
              <button
                className="admin-button"
                disabled={filters.page >= pages}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page + 1,
                  }))
                }
              >
                다음
              </button>
            </nav>
          </section>
          <p className="admin-footnote">
            로그인 후 계정에 저장한 누적 기록입니다. 비회원의 브라우저 기록은
            포함되지 않습니다. 정답률은 현재 문제은행으로 채점할 수 있는 제출
            기록을 기준으로 계산합니다.
            {report.summary.ungraded > 0 &&
              ` 현재 문제은행에서 찾을 수 없는 ${number(report.summary.ungraded)}건은 정답·오답 집계에서 제외했습니다.`}
          </p>
        </>
      )}
    </main>
  );
}
