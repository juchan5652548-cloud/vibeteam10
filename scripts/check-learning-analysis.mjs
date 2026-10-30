// Real analysis, provider adapter and route handlers; isolated local fixtures only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const modules = {
  'server-only': {},
  zod: require('zod'),
  'node:crypto': require('node:crypto'),
};
const secret = 'PRIVATE_TEST_VALUE_NOT_FOR_RESPONSES';
const env = { GEMINI_API_KEY: 'fixture-only-key' };
let providerStatus = 200,
  providerText = '서로 다른 문제를 더 풀고 계산 조건을 확인해 보세요.',
  providerCall;
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(code, {
    module: loaded,
    exports: loaded.exports,
    Request,
    Response,
    URL,
    AbortSignal,
    TextDecoder,
    crypto,
    Error,
    RangeError,
    SyntaxError,
    TypeError,
    process: { env },
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module ${name}`);
      return modules[name];
    },
    fetch: async (url, init) => {
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      providerCall = JSON.parse(init.body);
      return Response.json(
        providerStatus === 200
          ? {
              candidates: [
                {
                  finishReason: 'STOP',
                  content: { parts: [{ text: providerText }] },
                },
              ],
            }
          : { error: secret },
        { status: providerStatus },
      );
    },
  });
  return loaded.exports;
}
modules['./practice-types'] = await load('../src/lib/practice-types.ts');
const learning = await load('../src/lib/learning-analysis.ts');
modules['@/lib/learning-analysis'] = learning;
modules['./ai-hint'] = await load('../src/lib/ai-hint.ts');
modules['@/lib/learning-coach'] = await load('../src/lib/learning-coach.ts');
modules['@/lib/limited-json'] = await load('../src/lib/limited-json.ts');

const questions = ['enterprise', 'public_ncs', 'hospital'].flatMap((track, t) =>
  Array.from({ length: 8 }, (_, i) => ({
    id: `${'EPH'[t]}${String(i + 1).padStart(3, '0')}`,
    track,
    area: i < 4 ? '수리' : '추리',
    subtype: `유형 ${i % 4}`,
    difficulty: 'easy',
    passage: secret,
    prompt: secret,
    choices: [],
  })),
);
function attempt(id, questionId, correct, elapsedSeconds = 30) {
  return {
    attemptId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    questionId,
    choiceId: 'A',
    correct,
    answerId: 'A',
    explanation: secret,
    feedback: secret,
    misconception: correct ? null : '계산 조건',
    elapsedSeconds,
    completedAt: new Date(Date.UTC(2026, 9, 30, 1, 0, id)).toISOString(),
  };
}
const attempts = [
  attempt(1, 'E001', false),
  attempt(2, 'E001', false),
  attempt(3, 'E001', true),
  attempt(4, 'E002', false),
  attempt(5, 'E003', false),
  attempt(6, 'H001', true),
];
const summary = learning.buildLearningSummary(
  questions,
  attempts,
  'enterprise',
);
assert.equal(summary.submissions, 5);
assert.equal(summary.uniqueQuestions, 3);
assert.equal(summary.correct, 1);
assert.equal(summary.weakest.rate, 33);
assert.equal(summary.weakest.track, 'enterprise');
assert.equal(
  learning.buildLearningSummary(questions, attempts.slice(0, 3)).weakest,
  null,
  'repetition is not independent evidence',
);
assert.equal(
  learning.buildLearningSummary(questions, attempts.slice(0, 3)).correct,
  1,
  'latest answer resolves an old error',
);
assert.equal(
  learning.buildLearningSummary(
    questions,
    [...attempts].reverse(),
    'enterprise',
  ).correct,
  1,
  'input order is not trusted',
);
assert.equal(
  learning.buildLearningSummary(
    questions,
    [...attempts, attempts[0]],
    'enterprise',
  ).submissions,
  5,
  'duplicate request IDs do not inflate history',
);
assert.equal(
  learning.buildLearningSummary(questions, [
    attempt(1, 'E001', true),
    attempt(2, 'E002', true),
    attempt(3, 'E003', true),
  ]).weakest,
  null,
  'perfect areas are not weaknesses',
);
assert.equal(
  learning.buildLearningSummary(questions, [], 'hospital').uniqueQuestions,
  0,
);
assert.ok(
  learning
    .buildLearningSummary(questions, attempts)
    .areas.filter((a) => a.name === '수리').length === 3,
  'same area names remain separate across tracks',
);
const recommendation = learning.recommendQuestions(
  questions,
  attempts,
  'enterprise',
);
assert.ok(
  recommendation.every(
    (q) => q.track === 'enterprise' && q.area === '수리' && q.id !== 'E001',
  ),
);
assert.equal(
  new Set(recommendation.map((q) => q.id)).size,
  recommendation.length,
);
const diagnostic = learning.diagnosticQuestions(questions, attempts);
assert.equal(diagnostic.length, 6);
for (const track of ['enterprise', 'public_ncs', 'hospital'])
  assert.equal(diagnostic.filter((q) => q.track === track).length, 2);
assert.equal(new Set(diagnostic.map((q) => q.id)).size, 6);
assert.ok(
  learning
    .diagnosticQuestions(questions, attempts, 'hospital')
    .every((q) => q.track === 'hospital'),
);

await modules['@/lib/learning-coach'].generateLearningReview(
  { ...summary, email: secret, userId: secret },
  env.GEMINI_API_KEY,
);
assert.ok(
  !JSON.stringify(providerCall).includes(secret),
  'provider gets only aggregated, projected evidence',
);
assert.ok(!JSON.stringify(providerCall).includes('attemptId'));
assert.ok(!JSON.stringify(providerCall).includes('completedAt'));

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let configured = true,
  signedIn = true,
  busy = false,
  progress = attempts,
  releases = 0;
const client = {
  auth: {
    getUser: async () => ({
      data: { user: signedIn ? { id: actorId, email: secret } : null },
      error: null,
    }),
  },
};
modules['@/lib/auth-server'] = {
  authConfigured: () => configured,
  authClient: async () => client,
  privateHeaders,
  sameOrigin: (request) =>
    request.headers.get('origin') === new URL(request.url).origin,
};
modules['@/lib/account-progress'] = {
  loadAccountProgress: async (receivedClient, userId) => {
    assert.equal(receivedClient, client);
    assert.equal(userId, actorId);
    return { attempts: progress, bookmarks: [], version: 1 };
  },
};
modules['@/lib/question-bank'] = {
  getPublicQuestions: () => questions,
  gradeQuestion: (id, choice) => ({
    questionId: id,
    choiceId: choice,
    correct: true,
    answerId: 'A',
    explanation: 'fixture',
    feedback: 'fixture',
    misconception: null,
  }),
};
modules['@/lib/ai-hint'] = {
  acquireHintSlot: () =>
    busy
      ? null
      : () => {
          releases++;
        },
};
const route = await load('../src/app/api/practice/analysis/route.ts');
const origin = 'https://example.invalid';
const request = (body = { track: 'enterprise' }, headers = {}) =>
  new Request(`${origin}/api/practice/analysis`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
async function check(request, status) {
  const response = await route.POST(request);
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const body = await response.json();
  assert.ok(!JSON.stringify(body).includes(secret));
  return { body, response };
}
assert.equal((await check(request(), 200)).body.sampleSize, 3);
assert.equal(releases, 1);
await check(request({}, { origin: 'https://other.invalid' }), 403);
await check(request({}, { 'content-type': 'text/plain' }), 415);
await check(request({ track: 'invalid' }), 400);
await check(request({ track: 'all', userId: actorId }), 400);
await check(request({ track: 'all', attempts }), 413);
await check(
  new Request(`${origin}/api/practice/analysis`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{',
  }),
  400,
);
signedIn = false;
await check(request(), 401);
signedIn = true;
configured = false;
await check(request(), 401);
configured = true;
env.GEMINI_API_KEY = '';
await check(request(), 503);
env.GEMINI_API_KEY = 'fixture-only-key';
progress = [];
await check(request(), 422);
progress = attempts;
busy = true;
assert.equal(
  (await check(request(), 429)).response.headers.get('retry-after'),
  '60',
);
busy = false;
providerStatus = 429;
await check(request(), 429);
providerStatus = 500;
await check(request(), 503);
providerStatus = 200;
providerText = '';
await check(request(), 503);
providerText = '검증한 기록을 바탕으로 연습해 보세요.';
await check(request(), 200);
assert.equal(
  releases,
  5,
  'all acquired slots are released, including failed provider requests',
);

let selectedColumns = '';
const query = {
  upsert: async (_data, options) => {
    assert.equal(options.ignoreDuplicates, true);
    return { error: null };
  },
  select(columns) {
    selectedColumns = columns;
    return this;
  },
  eq(column, value) {
    if (column === 'user_id') assert.equal(value, actorId);
    return this;
  },
  single: async () => ({
    error: null,
    data: {
      question_id: 'E001',
      choice_id: 'A',
      elapsed_seconds: 7,
      completed_at: '2026-10-30T01:00:00.000Z',
    },
  }),
};
client.from = () => query;
const gradeRoute = await load('../src/app/api/practice/check/route.ts');
const gradeResponse = await gradeRoute.POST(
  new Request(`${origin}/api/practice/check`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      questionId: 'E001',
      choiceId: 'A',
      attemptId: actorId,
      elapsedSeconds: 99,
      requireAccount: true,
    }),
  }),
);
assert.equal(gradeResponse.status, 200);
assert.equal(
  (await gradeResponse.json()).elapsedSeconds,
  7,
  'retry returns persisted time rather than the new request duration',
);
assert.ok(selectedColumns.includes('elapsed_seconds'));
console.log(
  'PASS: distinct/latest/track-aware analysis; diagnosis and recommendations; provider privacy; 16 analysis route cases; persisted retry time',
);
