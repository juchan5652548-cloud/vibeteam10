-- Supabase-native data tables; do not manage these through Prisma migrations.
-- No existing application tables are modified. Run as one transaction.
BEGIN;

CREATE TABLE "practice_attempts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "question_id" TEXT NOT NULL CHECK (question_id ~ '^[EHP][0-9]{3}$'),
  "choice_id" TEXT NOT NULL CHECK (choice_id IN ('A','B','C','D')),
  "elapsed_seconds" INTEGER NOT NULL CHECK (elapsed_seconds BETWEEN 0 AND 86400),
  "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "practice_attempts_user_id_completed_at_idx" ON "practice_attempts"("user_id", "completed_at");
ALTER TABLE "practice_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "practice_attempts" FROM anon, authenticated;
GRANT SELECT, INSERT ON "practice_attempts" TO authenticated;
CREATE POLICY "attempts_read_own" ON "practice_attempts" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "attempts_insert_own" ON "practice_attempts" FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE "practice_bookmarks" (
  "user_id" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "question_id" TEXT NOT NULL CHECK (question_id ~ '^[EHP][0-9]{3}$'),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_bookmarks_pkey" PRIMARY KEY ("user_id", "question_id")
);
ALTER TABLE "practice_bookmarks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "practice_bookmarks" FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON "practice_bookmarks" TO authenticated;
CREATE POLICY "bookmarks_read_own" ON "practice_bookmarks" FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "bookmarks_insert_own" ON "practice_bookmarks" FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "bookmarks_delete_own" ON "practice_bookmarks" FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
COMMIT;
