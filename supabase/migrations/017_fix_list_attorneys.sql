-- ═══════════════════════════════════════════
-- 017: list_attorneys() — don't drop users with NULL is_active
--
-- users.is_active is nullable (DEFAULT true, but no NOT NULL). Rows created
-- outside the normal path — e.g. an auth trigger that only sets id/email/
-- full_name — end up with is_active = NULL, and `WHERE is_active = true`
-- silently excludes them. Result: the collaborator dropdown renders empty
-- and the "compartido con" option never appears.
--
-- IS NOT FALSE keeps both true and NULL, excluding only explicit false.
-- Also backfills existing NULLs so the column behaves as intended.
-- ═══════════════════════════════════════════

UPDATE users SET is_active = true WHERE is_active IS NULL;

CREATE OR REPLACE FUNCTION list_attorneys()
RETURNS TABLE(id UUID, full_name TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, full_name FROM users WHERE is_active IS NOT FALSE ORDER BY full_name;
$$;
GRANT EXECUTE ON FUNCTION list_attorneys() TO authenticated;
