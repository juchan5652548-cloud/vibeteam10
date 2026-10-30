BEGIN;

-- Keep privileged implementation outside the exposed Data API schema.
CREATE SCHEMA jobfit_private;
REVOKE ALL ON SCHEMA jobfit_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA jobfit_private TO authenticated;

ALTER FUNCTION public.jobfit_is_admin() SET SCHEMA jobfit_private;
ALTER FUNCTION public.jobfit_admin_learning_stats(jsonb,integer,text,text,text) SET SCHEMA jobfit_private;

-- The public RPC entry points use the caller's privileges. The private
-- implementation still verifies auth.uid() and the approved GitHub identity.
CREATE FUNCTION public.jobfit_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT jobfit_private.jobfit_is_admin(); $$;

CREATE FUNCTION public.jobfit_admin_learning_stats(
  p_answer_key jsonb,
  p_page integer DEFAULT 1,
  p_search text DEFAULT '',
  p_track text DEFAULT 'all',
  p_sort text DEFAULT 'recent'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jobfit_private.jobfit_admin_learning_stats(
    p_answer_key,p_page,p_search,p_track,p_sort
  );
$$;

REVOKE ALL ON FUNCTION public.jobfit_is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jobfit_admin_learning_stats(jsonb,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobfit_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.jobfit_admin_learning_stats(jsonb,integer,text,text,text) TO authenticated;

COMMIT;
