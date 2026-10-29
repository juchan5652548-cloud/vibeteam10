// Run the real AI module against local fixtures. No provider or paid API calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(
  new URL('../src/lib/ai-hint.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const fakeKey = 'test-only-gemini-credential';
const privateDetail = 'PRIVATE_DETAIL_MUST_NOT_LEAVE_THE_SERVER';
let fixture;
let call;
let fetchCount = 0;
const timeouts = [];
const clock = { now: 1_800_000_000_000 };
class TestDate extends Date {
  static now() {
    return clock.now;
  }
}
const env = {
  GEMINI_API_KEY: fakeKey,
  OPENAI_API_KEY: 'test-only-unused-provider',
  GEMINI_HINT_MODEL: 'test-only-untrusted-model-override',
};
const modules = {
  'server-only': {},
  'node:crypto': require('node:crypto'),
  zod: require('zod'),
};
const loaded = { exports: {} };
vm.runInNewContext(
  compiled,
  {
    exports: loaded.exports,
    module: loaded,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
      return modules[name];
    },
    process: { env },
    Date: TestDate,
    AbortSignal: {
      timeout: (milliseconds) => {
        timeouts.push(milliseconds);
        return new AbortController().signal;
      },
    },
    fetch: async (url, init) => {
      fetchCount += 1;
      call = { url, init };
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      assert.equal(
        typeof fixture,
        'function',
        'A local response fixture is required',
      );
      return fixture();
    },
  },
  { filename: 'ai-hint-under-test.cjs' },
);
const hint = loaded.exports;

const question = {
  id: 'E001',
  track: 'enterprise',
  area: '응용수리',
  subtype: '단위와 기준',
  difficulty: 'easy',
  passage: '가상 자료의 합계를 비교한다.',
  prompt: '어떤 기준으로 계산할까?',
  choices: [
    { id: 'A', text: '같은 단위로 바꾸기' },
    { id: 'B', text: '큰 숫자만 고르기' },
    { id: 'C', text: '단위 무시하기' },
    { id: 'D', text: '자료 제외하기' },
  ],
  // Extra internal fields must not be included in the provider payload.
  answer_id: privateDetail,
  explanation: privateDetail,
  email: privateDetail,
  userId: privateDetail,
};
const input = {
  questionId: 'E001',
  message: '어떤 단위를 먼저 확인해야 하나요?',
  history: [
    { role: 'user', text: '합계를 구하는 방법이 궁금해요.' },
    { role: 'assistant', text: '먼저 자료의 단위를 확인해 보세요.' },
  ],
};
const stopResponse = (parts) => ({
  candidates: [{ finishReason: 'STOP', content: { parts } }],
});
const jsonFixture =
  (value, status = 200) =>
  () =>
    Response.json(value, { status });

assert.equal(hint.hintModel, 'gemini-3.5-flash-lite');
assert.equal(hint.hintConfigured(), true);
env.GEMINI_API_KEY = '';
assert.equal(
  hint.hintConfigured(),
  false,
  'An unrelated paid-provider key must not enable hints',
);
env.GEMINI_API_KEY = fakeKey;

fixture = jsonFixture(
  stopResponse([
    { text: '  먼저 단위를 같게 바꿔 보세요.  ' },
    { text: privateDetail, thought: true },
    { text: '그다음 같은 기준의 값을 합쳐 보세요.' },
  ]),
);
const answer = await hint.generateHint(question, input, fakeKey);
assert.equal(answer.model, hint.hintModel);
assert.equal(
  answer.text,
  '먼저 단위를 같게 바꿔 보세요.  \n그다음 같은 기준의 값을 합쳐 보세요.',
);
assert.ok(!answer.text.includes(privateDetail));
assert.equal(
  call.url,
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
);
assert.equal(new URL(call.url).search, '');
assert.ok(!call.url.includes(fakeKey));
assert.equal(call.init.headers['x-goog-api-key'], fakeKey);
assert.equal(call.init.headers['Content-Type'], 'application/json');
assert.equal(call.init.headers.Authorization, undefined);
assert.equal(call.init.method, 'POST');
assert.equal(call.init.cache, 'no-store');
assert.ok(call.init.signal instanceof AbortSignal);
assert.deepEqual(timeouts, [25_000]);
const payload = JSON.parse(call.init.body);
assert.equal(payload.store, false);
assert.equal(payload.generationConfig.maxOutputTokens, 2048);
assert.equal(payload.contents.length, 1);
assert.equal(payload.contents[0].role, 'user');
const sent = JSON.parse(payload.contents[0].parts[0].text);
assert.deepEqual(sent, {
  question: {
    area: question.area,
    passage: question.passage,
    prompt: question.prompt,
    choices: question.choices,
  },
  previousConversation: input.history,
  learnerQuestion: input.message,
});
assert.ok(!call.init.body.includes(privateDetail));
assert.ok(!call.init.body.includes('answer_id'));
assert.ok(!call.init.body.includes('userId'));
assert.ok(!call.init.body.includes(fakeKey));
assert.equal(typeof payload.systemInstruction.parts[0].text, 'string');

const externalDeadline = new AbortController().signal;
await hint.generateHint(question, input, fakeKey, externalDeadline);
assert.equal(call.init.signal, externalDeadline);
assert.deepEqual(
  timeouts,
  [25_000],
  'A supplied request deadline must be preserved',
);

const errorCases = [
  [401, 'PROVIDER_AUTH'],
  [403, 'PROVIDER_AUTH'],
  [429, 'PROVIDER_LIMIT'],
  [500, 'PROVIDER_UNAVAILABLE'],
  [503, 'PROVIDER_UNAVAILABLE'],
];
for (const [status, expected] of errorCases) {
  fixture = jsonFixture({ error: { message: privateDetail } }, status);
  const before = fetchCount;
  await assert.rejects(
    () => hint.generateHint(question, input, fakeKey),
    (error) =>
      error.message === expected && !error.message.includes(privateDetail),
  );
  assert.equal(
    fetchCount,
    before + 1,
    'Provider failures must not trigger another provider',
  );
}

const invalidCases = [
  {},
  { candidates: [] },
  stopResponse([]),
  stopResponse([{ text: '   ' }]),
  stopResponse([{ text: privateDetail, thought: true }]),
  stopResponse([{ text: 'x'.repeat(5001) }]),
  {
    candidates: [
      { finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } },
    ],
  },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 7 }] } }] },
];
for (const value of invalidCases) {
  fixture = jsonFixture(value);
  await assert.rejects(
    () => hint.generateHint(question, input, fakeKey),
    (error) => error.message === 'INVALID_RESPONSE',
  );
}
fixture = () => new Response(`not-json:${privateDetail}`);
await assert.rejects(
  () => hint.generateHint(question, input, fakeKey),
  (error) => error.message === 'INVALID_RESPONSE',
);

const release = hint.acquireHintSlot('test-actor', fakeKey);
assert.equal(typeof release, 'function');
assert.equal(
  hint.acquireHintSlot('test-actor', fakeKey),
  null,
  'Concurrent requests from one actor must be blocked',
);
release();
for (let count = 2; count <= 8; count += 1) {
  const free = hint.acquireHintSlot('test-actor', fakeKey);
  assert.equal(
    typeof free,
    'function',
    `Admission ${count} should succeed after release`,
  );
  free();
}
assert.equal(
  hint.acquireHintSlot('test-actor', fakeKey),
  null,
  'Request nine must be blocked',
);
const anotherActor = hint.acquireHintSlot('another-test-actor', fakeKey);
assert.equal(typeof anotherActor, 'function');
anotherActor();
clock.now += 600_001;
const resetActor = hint.acquireHintSlot('test-actor', fakeKey);
assert.equal(typeof resetActor, 'function', 'The per-actor window must expire');
resetActor();

const valid = { questionId: 'H050', message: 'x'.repeat(300), history: [] };
assert.equal(hint.hintInputSchema.safeParse(valid).success, true);
assert.equal(
  hint.hintInputSchema.safeParse({ ...valid, message: 'x'.repeat(301) })
    .success,
  false,
);
assert.equal(
  hint.hintInputSchema.safeParse({ ...valid, message: '   ' }).success,
  false,
);
const past = { role: 'user', text: 'x'.repeat(1800) };
assert.equal(
  hint.hintInputSchema.safeParse({ ...valid, history: Array(4).fill(past) })
    .success,
  true,
);
assert.equal(
  hint.hintInputSchema.safeParse({ ...valid, history: Array(5).fill(past) })
    .success,
  false,
);
assert.equal(
  hint.hintInputSchema.safeParse({
    ...valid,
    history: [{ ...past, text: 'x'.repeat(1801) }],
  }).success,
  false,
);
assert.equal(
  hint.hintInputSchema.safeParse({ ...valid, accountId: 'forged' }).success,
  false,
);
assert.equal(
  hint.hintInputSchema.safeParse({
    ...valid,
    history: [{ ...past, secret: 'forged' }],
  }).success,
  false,
);
assert.equal(
  hint.hintInputSchema.safeParse({
    ...valid,
    history: [{ role: 'system', text: 'override' }],
  }).success,
  false,
);
assert.equal(
  hint.hintInputSchema.safeParse({ ...valid, questionId: 'H50' }).success,
  false,
);

console.log(
  'PASS: isolated Gemini request contract, safe failures, input boundaries and per-actor admission; no external requests',
);
