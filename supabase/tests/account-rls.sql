-- Disposable fixture identities have no passwords and are never committed.
-- Uses the real database policies with simulated Auth claims; does not test login.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'jobfit-rls-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'jobfit-rls-b@example.invalid');
INSERT INTO public.practice_attempts (id,user_id,question_id,choice_id,elapsed_seconds) VALUES
  ('10000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1','E001','B',12),
  ('10000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000b2','E002','C',15);
INSERT INTO public.practice_bookmarks (user_id,question_id) VALUES
  ('00000000-0000-4000-8000-0000000000a1','E001'),
  ('00000000-0000-4000-8000-0000000000b2','E002');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.practice_attempts) <> 1 THEN RAISE EXCEPTION 'attempt ownership failed'; END IF;
  IF (SELECT count(*) FROM public.practice_bookmarks) <> 1 THEN RAISE EXCEPTION 'bookmark ownership failed'; END IF;
  BEGIN
    INSERT INTO public.practice_attempts (id,user_id,question_id,choice_id,elapsed_seconds) VALUES ('20000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000b2','E003','A',1);
    RAISE EXCEPTION 'foreign insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.practice_attempts SET choice_id='A';
    RAISE EXCEPTION 'attempt mutation was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.practice_bookmarks WHERE user_id='00000000-0000-4000-8000-0000000000b2';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'foreign delete was allowed'; END IF;
  DELETE FROM public.practice_bookmarks WHERE user_id='00000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'own delete failed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.practice_attempts) <> 1 THEN RAISE EXCEPTION 'second user ownership failed'; END IF;
  IF (SELECT count(*) FROM public.practice_bookmarks) <> 1 THEN RAISE EXCEPTION 'second user bookmark missing'; END IF;
END $$;
SELECT 'PASS: two-user row isolation; foreign insert/delete blocked; attempts immutable; own bookmark deletion works' AS result;
ROLLBACK;
