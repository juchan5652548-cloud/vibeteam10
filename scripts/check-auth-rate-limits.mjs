// Run the real route with an isolated Auth stub; no Supabase requests or emails.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(
  new URL('../src/app/api/auth/route.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const origin = 'https://jobfit.test';
const sentinel = 'PRIVATE_PROVIDER_DETAIL_MUST_NOT_APPEAR';
let result;
let calls = [];
const auth = Object.fromEntries(
  ['signUp', 'signInWithPassword', 'resetPasswordForEmail'].map((method) => [
    method,
    async (...args) => {
      calls.push({ method, args });
      return result;
    },
  ]),
);
const modules = {
  zod: require('zod'),
  '@/lib/auth-server': {
    authClient: async () => ({ auth }),
    authConfigured: () => true,
    privateHeaders: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    sameOrigin: (request) => request.headers.get('origin') === origin,
  },
  '@/lib/limited-json': {
    readLimitedJson: (request) => request.json(),
  },
};
const route = { exports: {} };
vm.runInNewContext(
  compiled,
  {
    exports: route.exports,
    module: route,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
      return modules[name];
    },
    Request,
    Response,
    URL,
    process: { env: {} },
    fetch: () => {
      throw new Error('Network access is forbidden in this test');
    },
  },
  { filename: 'auth-route-under-test.cjs' },
);

const actions = {
  signup: 'signUp',
  login: 'signInWithPassword',
  recover: 'resetPasswordForEmail',
};
async function request(action, fixture) {
  result = fixture;
  calls = [];
  const response = await route.exports.POST(
    new Request(`${origin}/api/auth`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        email: 'learner@example.com',
        ...(action === 'recover' ? {} : { password: sentinel }),
      }),
    }),
  );
  const body = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('retry-after'), null);
  assert.ok(!JSON.stringify(body).includes(sentinel));
  assert.deepEqual(
    calls.map((call) => call.method),
    [actions[action]],
  );
  return { response, body };
}

const failures = [
  ['over_email_send_rate_limit', 429, 'EMAIL_SEND_LIMITED'],
  ['over_request_rate_limit', 429, 'AUTH_REQUEST_LIMITED'],
  ['unrecognized_limit', 429, 'AUTH_RATE_LIMITED'],
  ['unrecognized_error', 400, undefined],
];
let checked = 0;
for (const action of Object.keys(actions)) {
  for (const [code, status, expectedCode] of failures) {
    const { response, body } = await request(action, {
      data: { session: null },
      error: { code, status, message: sentinel, details: sentinel },
    });
    assert.equal(
      response.status,
      expectedCode ? 429 : action === 'recover' ? 503 : 400,
    );
    assert.equal(body.code, expectedCode);
    assert.equal(typeof body.error, 'string');
    assert.ok(body.error.length > 0);
    if (expectedCode) {
      assert.equal(body.retryAfterSeconds, 60);
      assert.equal(
        body.error.includes('메일 발송 한도'),
        expectedCode === 'EMAIL_SEND_LIMITED',
      );
    } else {
      assert.equal(body.retryAfterSeconds, undefined);
    }
    checked += 1;
  }
}

for (const action of Object.keys(actions)) {
  const { response, body } = await request(action, {
    data: {
      session: action === 'login' ? { user: { id: 'test-user' } } : null,
    },
    error: null,
  });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.error, undefined);
  assert.equal(body.retryAfterSeconds, undefined);
  if (action !== 'recover') assert.equal(body.signedIn, action === 'login');
  if (action === 'signup') {
    assert.equal(
      calls[0].args[0].options.emailRedirectTo,
      `${origin}/auth/callback`,
    );
  }
  if (action === 'recover') {
    assert.equal(
      calls[0].args[1].redirectTo,
      `${origin}/auth/callback?recovery=1`,
    );
  }
  checked += 1;
}

console.log(
  `PASS: ${checked} isolated Auth route cases; no network, accounts or emails`,
);
