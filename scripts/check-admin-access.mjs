// Exercise the actual route and role helper without network or account writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const modules = { zod: require('zod'), 'server-only': {} };
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    Request,
    Response,
    URL,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    },
    fetch: () => {
      throw new Error('Network forbidden');
    },
  });
  return loadedModule.exports;
}
modules['@/lib/admin-access'] = await load('../src/lib/admin-access.ts');
modules['@/lib/admin-types'] = await load('../src/lib/admin-types.ts');
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const sentinel = 'PRIVATE_DATABASE_DETAIL';
let configured, auth, access, stats, throwRole, calls;
const fixture = {
  page: 1,
  pageSize: 50,
  totalUsers: 1,
  summary: {
    activeUsers: 1,
    attempts: 3,
    correct: 1,
    wrong: 2,
    ungraded: 0,
    accuracy: 33.3,
  },
  users: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Fixture learner',
      email: 'fixture@example.invalid',
      attempts: 3,
      uniqueQuestions: 2,
      correct: 1,
      wrong: 2,
      ungraded: 0,
      accuracy: 33.3,
      elapsedSeconds: 50,
      lastActiveAt: '2026-10-30T01:00:00+00:00',
    },
  ],
};
function reset() {
  configured = true;
  auth = {
    data: {
      user: {
        id: 'verified-user',
        user_metadata: { role: 'admin', provider_id: '267583432' },
      },
    },
    error: null,
  };
  access = { data: true, error: null };
  stats = { data: fixture, error: null };
  throwRole = false;
  calls = [];
}
modules['@/lib/auth-server'] = {
  authConfigured: () => configured,
  authClient: async () => ({
    auth: { getUser: async () => auth },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'jobfit_is_admin') {
        if (throwRole) throw new Error(sentinel);
        return access;
      }
      assert.equal(name, 'jobfit_admin_learning_stats');
      return stats;
    },
  }),
  privateHeaders,
};
modules['@/lib/question-bank'] = {
  getQuestionAnswerKey: () => ({ E001: 'A' }),
};
const route = await load('../src/app/api/admin/learning/route.ts');
let checked = 0;
async function check(status, query = '') {
  const response = await route.GET(
    new Request(`https://jobfit.test/api/admin/learning${query}`),
  );
  const body = await response.json();
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.ok(!JSON.stringify(body).includes(sentinel));
  if (status !== 200) {
    assert.equal(body.users, undefined);
    assert.equal(body.summary, undefined);
  }
  checked++;
  return body;
}

reset();
configured = false;
await check(503);
assert.equal(calls.length, 0);
reset();
auth.data.user = null;
await check(401);
assert.equal(calls.length, 0);
reset();
auth.error = { message: sentinel };
await check(401);
assert.equal(calls.length, 0);
reset();
access.data = false;
await check(403);
assert.equal(calls.length, 1);
reset();
access.error = { message: sentinel };
await check(503);
assert.equal(calls.length, 1);
reset();
access.data = 'true';
await check(503);
assert.equal(calls.length, 1);
reset();
throwRole = true;
await check(503);
assert.equal(calls.length, 1);
for (const query of [
  '?page=0',
  '?page=1.5',
  '?page=100001',
  '?track=secret',
  '?sort=sql',
  '?role=admin',
  '?page=1&page=2',
  `?search=${'x'.repeat(81)}`,
]) {
  reset();
  await check(400, query);
  assert.equal(calls.length, 1);
}
reset();
stats.error = { code: '42501', message: sentinel };
await check(403);
reset();
stats.error = { code: 'PGRST202', message: sentinel };
await check(503);
reset();
stats.data = { bad: sentinel };
await check(503);
reset();
const body = await check(200, '?page=2&search=test&track=hospital&sort=wrong');
assert.deepEqual(body, fixture);
assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args)), {
  p_answer_key: { E001: 'A' },
  p_page: 2,
  p_search: 'test',
  p_track: 'hospital',
  p_sort: 'wrong',
});
assert.equal(body.p_answer_key, undefined);
console.log(
  `PASS: ${checked} admin route cases; anonymous/member/spoofed metadata denied, errors private, query bounds and admin success verified`,
);
