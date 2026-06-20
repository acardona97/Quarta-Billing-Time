-- ═══════════════════════════════════════════
-- 011: FIX infinite recursion in user_client_assignments policies
--
-- 010 added a SELECT/INSERT policy on user_client_assignments whose USING
-- clause sub-queried user_client_assignments itself → Postgres re-applies the
-- policy on that sub-query → infinite recursion. Any query touching
-- assignments (and clients/matters, which sub-query assignments) failed, so
-- data looked "lost". Nothing was deleted — fixing the policies restores it.
--
-- Fix: a SECURITY DEFINER helper my_client_ids() reads assignments WITHOUT
-- triggering RLS, so policies can use it with zero recursion. All affected
-- policies are rewritten to use it.
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION my_client_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT client_id FROM user_client_assignments
  WHERE user_id = auth.uid() AND is_active = true;
$$;
GRANT EXECUTE ON FUNCTION my_client_ids() TO authenticated;

-- ── user_client_assignments ──
DROP POLICY IF EXISTS assignments_select ON user_client_assignments;
CREATE POLICY assignments_select ON user_client_assignments FOR SELECT USING (
  user_id = auth.uid()
  OR is_admin()
  OR client_id IN (SELECT my_client_ids())
);

DROP POLICY IF EXISTS assignments_insert ON user_client_assignments;
CREATE POLICY assignments_insert ON user_client_assignments FOR INSERT WITH CHECK (
  is_admin()
  OR user_id = auth.uid()
  OR client_id IN (SELECT my_client_ids())
);

-- ── clients ──
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT USING (
  is_admin()
  OR is_firm_client
  OR created_by = auth.uid()
  OR id IN (SELECT my_client_ids())
);

DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients FOR UPDATE USING (
  CASE WHEN is_firm_client THEN is_super_admin()
       ELSE (is_admin() OR created_by = auth.uid() OR id IN (SELECT my_client_ids()))
  END
);

DROP POLICY IF EXISTS clients_delete ON clients;
CREATE POLICY clients_delete ON clients FOR DELETE USING (
  CASE WHEN is_firm_client THEN is_super_admin()
       ELSE (is_admin() OR created_by = auth.uid() OR id IN (SELECT my_client_ids()))
  END
);

-- ── matters ──
DROP POLICY IF EXISTS matters_select ON matters;
CREATE POLICY matters_select ON matters FOR SELECT USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT my_client_ids())
);

DROP POLICY IF EXISTS matters_update ON matters;
CREATE POLICY matters_update ON matters FOR UPDATE USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT my_client_ids())
);

DROP POLICY IF EXISTS matters_delete ON matters;
CREATE POLICY matters_delete ON matters FOR DELETE USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT my_client_ids())
);
