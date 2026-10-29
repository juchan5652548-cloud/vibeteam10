export type Track = 'enterprise' | 'public_ncs' | 'hospital';
export type PageView =
  'home' | 'bank' | 'mistakes' | 'bookmarks' | 'stats' | 'guide';

export type PublicQuestion = {
  id: string;
  track: Track;
  area: string;
  subtype: string;
  difficulty: 'easy' | 'medium';
  passage: string;
  prompt: string;
  choices: { id: string; text: string }[];
};

export type Grade = {
  questionId: string;
  choiceId: string;
  correct: boolean;
  answerId: string;
  explanation: string;
  feedback: string;
  misconception: string | null;
};

export type Attempt = Grade & {
  attemptId: string;
  elapsedSeconds: number;
  completedAt: string;
};

export const tracks: {
  id: Track;
  name: string;
  short: string;
  description: string;
  tags: string[];
  color: string;
}[] = [
  {
    id: 'enterprise',
    name: '대기업 인적성',
    short: '대기업',
    description: '수리와 논리를 탄탄하게, 실전의 기본을 다져요.',
    tags: ['응용수리', '자료해석', '추리'],
    color: 'purple',
  },
  {
    id: 'public_ncs',
    name: '공기업 NCS',
    short: '공기업',
    description: '직업기초능력부터 상황별 문제해결까지.',
    tags: ['의사소통', '수리', '문제해결'],
    color: 'blue',
  },
  {
    id: 'hospital',
    name: '병원 인적성',
    short: '병원',
    description: '병원 업무 상황으로 기초역량을 연습해요.',
    tags: ['의사소통', '업무판단', '수리'],
    color: 'mint',
  },
];

export function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}분 ${rounded % 60}초`;
}

export function koreaDay(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
