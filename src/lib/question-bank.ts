import 'server-only';
import { z } from 'zod';
import hospitalPublic from '../../data/questions/hospital-public-v1.json';
import enterprise from '../../data/questions/enterprise-v1.json';
import type { PublicQuestion, Grade } from './practice-types';

const questionSchema = z.object({
  id: z.string(),
  track: z.enum(['enterprise', 'public_ncs', 'hospital']),
  area: z.string(),
  subtype: z.string(),
  difficulty: z.enum(['easy', 'medium']),
  passage: z.string(),
  prompt: z.string(),
  choices: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        feedback: z.string(),
        misconception_tag: z.string().nullable(),
      }),
    )
    .length(4),
  answer_id: z.string(),
  explanation: z.string(),
});

const questions = z
  .array(questionSchema)
  .parse([...enterprise.questions, ...hospitalPublic.questions]);
const questionMap = new Map(
  questions.map((question) => [question.id, question]),
);

// Sent only server-to-database for the protected administrator report.
export function getQuestionAnswerKey(): Record<string, string> {
  return Object.fromEntries(questions.map((q) => [q.id, q.answer_id]));
}

export function getPublicQuestions(): PublicQuestion[] {
  return questions.map(
    ({ id, track, area, subtype, difficulty, passage, prompt, choices }) => ({
      id,
      track,
      area,
      subtype,
      difficulty,
      passage,
      prompt,
      choices: choices.map(({ id: choiceId, text }) => ({
        id: choiceId,
        text,
      })),
    }),
  );
}

export function gradeQuestion(
  questionId: string,
  choiceId: string,
): Grade | null {
  const question = questionMap.get(questionId);
  const choice = question?.choices.find((item) => item.id === choiceId);
  if (!question || !choice) return null;
  return {
    questionId,
    choiceId,
    correct: choiceId === question.answer_id,
    answerId: question.answer_id,
    explanation: question.explanation,
    feedback: choice.feedback,
    misconception: choice.misconception_tag,
  };
}
