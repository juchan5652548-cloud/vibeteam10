import { getPublicQuestions } from '@/lib/question-bank';
import PracticeApp from './practice-app';

export default function Home() {
  return <PracticeApp questions={getPublicQuestions()} />;
}
