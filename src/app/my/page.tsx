import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { authClient, authConfigured } from '@/lib/auth-server';
import { getPublicQuestions } from '@/lib/question-bank';
import PracticeApp from '../practice-app';

async function MyPractice() {
  if (!authConfigured()) redirect('/?login=1');
  const client = await authClient(true);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect('/?login=1');
  return (
    <PracticeApp
      key={data.user.id}
      questions={getPublicQuestions()}
      initialView="mistakes"
    />
  );
}
export default function MyPage() {
  return (
    <Suspense
      fallback={
        <main className="main-content">
          <p className="account-banner" role="status">
            나의 학습 기록을 확인하고 있어요…
          </p>
        </main>
      }
    >
      <MyPractice />
    </Suspense>
  );
}
