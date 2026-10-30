-- Read-only reporting for the explicitly approved GitHub account.
-- Public GitHub ID 267583432 was verified for juchan5652548-cloud.
-- No learner records, existing RLS policies, or table grants are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.jobfit_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = auth.uid()
      AND i.provider = 'github'
      AND i.provider_id = '267583432'
  );
$$;
REVOKE ALL ON FUNCTION public.jobfit_is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobfit_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.jobfit_admin_learning_stats(
  p_answer_key jsonb,
  p_page integer DEFAULT 1,
  p_search text DEFAULT '',
  p_track text DEFAULT 'all',
  p_sort text DEFAULT 'recent'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- This check also protects direct Data API/RPC calls that bypass Next.js.
  IF NOT public.jobfit_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_search IS NULL OR length(p_search) > 80
    OR p_track IS NULL OR p_track NOT IN ('all','enterprise','public_ncs','hospital')
    OR p_sort IS NULL OR p_sort NOT IN ('recent','attempts','wrong','accuracy')
    OR p_answer_key IS NULL OR jsonb_typeof(p_answer_key) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_REPORT_INPUT' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_each(p_answer_key)) NOT BETWEEN 1 AND 2000
    OR EXISTS (SELECT 1 FROM jsonb_each_text(p_answer_key) k
      WHERE k.key !~ '^[EPH][0-9]{3}$' OR k.value IS NULL OR k.value NOT IN ('A','B','C','D')) THEN
    RAISE EXCEPTION 'INVALID_ANSWER_KEY' USING ERRCODE = '22023';
  END IF;

  WITH learners AS MATERIALIZED (
    SELECT u.id, coalesce(u.email, '') AS email,
      coalesce(nullif(u.raw_user_meta_data->>'full_name',''),
        nullif(u.raw_user_meta_data->>'user_name',''), '이름 없음') AS name
    FROM auth.users u
    WHERE u.deleted_at IS NULL
  ), selected AS MATERIALIZED (
    SELECT * FROM learners l
    WHERE position(lower(trim(p_search)) IN lower(l.name || ' ' || l.email)) > 0
  ), totals AS MATERIALIZED (
    SELECT l.id, l.email, l.name,
      count(a.id) AS attempts,
      count(DISTINCT a.question_id) AS unique_questions,
      count(a.id) FILTER (WHERE p_answer_key->>a.question_id = a.choice_id) AS correct,
      count(a.id) FILTER (WHERE p_answer_key->>a.question_id <> a.choice_id) AS wrong,
      count(a.id) FILTER (WHERE NOT (p_answer_key ? a.question_id)) AS ungraded,
      coalesce(sum(a.elapsed_seconds),0) AS elapsed_seconds,
      max(a.completed_at) AS last_active_at
    FROM selected l
    LEFT JOIN public.practice_attempts a ON a.user_id = l.id AND (
      p_track = 'all' OR left(a.question_id,1) = CASE p_track
        WHEN 'enterprise' THEN 'E' WHEN 'public_ncs' THEN 'P' WHEN 'hospital' THEN 'H' END
    )
    GROUP BY l.id,l.email,l.name
  ), scored AS MATERIALIZED (
    SELECT t.*, CASE WHEN correct+wrong = 0 THEN NULL
      ELSE round(100.0*correct/(correct+wrong),1) END AS accuracy
    FROM totals t
  ), ranked AS (
    SELECT s.*, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'attempts' THEN attempts END DESC NULLS LAST,
      CASE WHEN p_sort = 'wrong' THEN wrong END DESC NULLS LAST,
      CASE WHEN p_sort = 'accuracy' THEN accuracy END DESC NULLS LAST,
      last_active_at DESC NULLS LAST, id
    ) AS position
    FROM scored s
  ), page_rows AS (
    SELECT * FROM ranked
    ORDER BY position LIMIT 50 OFFSET (p_page-1)*50
  )
  SELECT jsonb_build_object(
    'page',p_page,'pageSize',50,'totalUsers',(SELECT count(*) FROM scored),
    'summary',(SELECT jsonb_build_object(
      'activeUsers',count(*) FILTER (WHERE attempts > 0),
      'attempts',coalesce(sum(attempts),0),
      'correct',coalesce(sum(correct),0),
      'wrong',coalesce(sum(wrong),0),
      'ungraded',coalesce(sum(ungraded),0),
      'accuracy',CASE WHEN coalesce(sum(correct+wrong),0)=0 THEN NULL
        ELSE round(100.0*sum(correct)/sum(correct+wrong),1) END
    ) FROM scored),
    'users',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'email',email,'attempts',attempts,
      'uniqueQuestions',unique_questions,'correct',correct,'wrong',wrong,
      'ungraded',ungraded,'accuracy',accuracy,'elapsedSeconds',elapsed_seconds,
      'lastActiveAt',last_active_at
    ) ORDER BY position) FROM page_rows),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.jobfit_admin_learning_stats(jsonb,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobfit_admin_learning_stats(jsonb,integer,text,text,text) TO authenticated;
COMMIT;
