// Run the real migrations against disposable, in-memory PostgreSQL (PGlite).
// Supabase Auth schema/claims are fixtures; production identities are untouched.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const learner = '00000000-0000-4000-8000-000000000001';
try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, deleted_at timestamptz);
    CREATE TABLE auth.identities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id), provider text, provider_id text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid
    $$;
    INSERT INTO auth.users (id,email) VALUES ('${admin}','admin@example.invalid');
    INSERT INTO auth.identities (user_id,provider,provider_id) VALUES ('${admin}','github','267583432');
  `);
  const migrationDirectory = new URL(
    '../supabase/migrations/',
    import.meta.url,
  );
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        'utf8',
      ),
    );
  }
  assert.equal(
    (
      await db.query(`SELECT count(*)::int AS n FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'jobfit_%' AND p.prosecdef`)
    ).rows[0].n,
    0,
    'public admin RPC entry points must not be security definer',
  );
  await db.exec(`
    BEGIN;
    INSERT INTO auth.users (id,email,raw_user_meta_data)
    SELECT ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
      'admin-fixture-' || i || '@example.invalid',
      jsonb_build_object('full_name','시험 회원 ' || i, 'role','admin','provider_id','267583432')
    FROM generate_series(1,52) i;
    INSERT INTO public.practice_attempts (id,user_id,question_id,choice_id,elapsed_seconds,completed_at) VALUES
      (gen_random_uuid(),'${learner}','E001','A',10,'2026-10-29T01:00:00Z'),
      (gen_random_uuid(),'${learner}','E001','B',20,'2026-10-29T01:01:00Z'),
      (gen_random_uuid(),'${learner}','P001','B',30,'2026-10-29T01:02:00Z'),
      (gen_random_uuid(),'${learner}','H999','A',40,'2026-10-29T01:03:00Z');
  `);
  async function asUser(role, id) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: id, role }),
    ]);
    await db.exec(`SET LOCAL ROLE ${role}`);
  }
  const args = [
    JSON.stringify({ E001: 'A', P001: 'A' }),
    1,
    'admin-fixture-',
    'all',
    'wrong',
  ];
  const reportSql =
    'SELECT public.jobfit_admin_learning_stats($1::jsonb,$2::integer,$3::text,$4::text,$5::text) AS report';
  async function report(values = args) {
    return (await db.query(reportSql, values)).rows[0].report;
  }
  async function denied(sql, values, code) {
    await db.exec('SAVEPOINT expected_failure');
    let failure;
    try {
      await db.query(sql, values);
    } catch (error) {
      failure = error;
    }
    await db.exec(
      'ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure',
    );
    assert.equal(failure?.code, code);
  }
  await asUser('anon', null);
  await denied('SELECT public.jobfit_is_admin()', [], '42501');
  await denied(reportSql, args, '42501');
  await asUser('authenticated', learner);
  assert.equal(
    (await db.query('SELECT public.jobfit_is_admin() AS allowed')).rows[0]
      .allowed,
    false,
  );
  await denied(reportSql, args, '42501');
  await asUser('authenticated', admin);
  assert.equal(
    (await db.query('SELECT public.jobfit_is_admin() AS allowed')).rows[0]
      .allowed,
    true,
  );
  assert.equal(
    Number(
      (await db.query('SELECT count(*) AS n FROM public.practice_attempts'))
        .rows[0].n,
    ),
    0,
    'admin must not gain broad table SELECT',
  );

  const all = await report();
  assert.equal(all.totalUsers, 52);
  assert.equal(all.users.length, 50);
  assert.deepEqual(all.summary, {
    activeUsers: 1,
    attempts: 4,
    correct: 1,
    wrong: 2,
    ungraded: 1,
    accuracy: 33.3,
  });
  assert.equal(all.users[0].id, learner);
  assert.equal(all.users[0].uniqueQuestions, 3);
  assert.equal(all.users[0].elapsedSeconds, 100);
  assert.equal(all.users[1].accuracy, null);
  assert.equal(
    (await report([args[0], 2, args[2], 'all', 'recent'])).users.length,
    2,
  );
  const enterprise = await report([
    args[0],
    1,
    args[2],
    'enterprise',
    'accuracy',
  ]);
  assert.deepEqual(enterprise.summary, {
    activeUsers: 1,
    attempts: 2,
    correct: 1,
    wrong: 1,
    ungraded: 0,
    accuracy: 50,
  });
  assert.equal(enterprise.users[0].uniqueQuestions, 1);
  const none = await report([args[0], 1, '%', 'all', 'recent']);
  assert.equal(none.totalUsers, 0, 'search wildcard must be literal');
  assert.equal(none.summary.attempts, 0);
  assert.equal(none.summary.accuracy, null);
  await denied(reportSql, ['{}', 1, '', 'all', 'recent'], '22023');
  await denied(reportSql, [args[0], 0, '', 'all', 'recent'], '22023');
  await denied(reportSql, [args[0], 1, '', 'invalid', 'recent'], '22023');
  await db.exec('RESET ROLE; ROLLBACK;');
  console.log(
    'PASS: PostgreSQL migrations; anonymous/member/spoofed metadata denied; admin stats; repeated/unknown questions; zero-history users; filters; pagination; RLS preserved',
  );
} finally {
  await db.close();
}
