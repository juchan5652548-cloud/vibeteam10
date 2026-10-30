import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authClient, authConfigured } from '@/lib/auth-server';
import { getAdminAccess } from '@/lib/admin-access';
import AdminDashboard from './admin-dashboard';

async function AdminContent() {
  if (!authConfigured()) redirect('/?login=1');
  const client = await authClient(true);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/?login=1');
  const access = await getAdminAccess(client);
  if (access !== 'admin') {
    return (
      <main className="admin-page">
        <h1>관리자 학습 현황</h1>
        <p className="admin-notice" role="alert">
          {access === 'member'
            ? '이 계정에는 관리자 권한이 없습니다.'
            : '관리자 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'}
        </p>
        <Link className="admin-button" href="/">
          학습 화면으로 돌아가기
        </Link>
      </main>
    );
  }
  return <AdminDashboard />;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-page">
          <p role="status">관리자 권한을 확인하고 있어요…</p>
        </main>
      }
    >
      <AdminContent />
    </Suspense>
  );
}
