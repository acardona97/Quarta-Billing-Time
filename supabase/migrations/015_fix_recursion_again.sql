-- ═══════════════════════════════════════════
-- 015: URGENT FIX — infinite recursion reintroduced by 014
--
-- 014 added to clients_select:
--     OR id IN (SELECT client_id FROM matters WHERE id IN (...))
-- while matters_select already had:
--     OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
--
-- That is a MUTUAL cycle: evaluating clients_select queries matters,
-- which fires matters_select, which queries clients, which fires
-- clients_select... Postgres aborts with "infinite recursion detected in
-- policy for relation", so every query touching clients or matters fails
-- and the app looks like all data vanished.
--
-- NOTHING WAS DELETED. Rows are intact; only visibility was broken.
--
-- Fix: both cross-table lookups move into SECURITY DEFINER helpers, which
-- read their table WITHOUT firing RLS — the same pattern that fixed the
-- original recursion in 011. No policy references the other table directly
-- anymore, so no cycle can form.
-- ═══════════════════════════════════════════

-- Clients reachable through a matter-level share (reads matters, no RLS).
CREATE OR REPLACE FUNCTION my_shared_client_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT m.client_id
  FROM matters m
  WHERE m.id IN (SELECT matter_id FROM matter_shares WHERE user_id = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION my_shared_client_ids() TO authenticated;

-- Firm-wide client ids (reads clients, no RLS).
CREATE OR REPLACE FUNCTION firm_client_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM clients WHERE is_firm_client;
$$;
GRANT EXECUTE ON FUNCTION firm_client_ids() TO authenticated;

-- ── clients: no longer queries matters ──
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT USING (
  is_admin()
  OR is_firm_client
  OR created_by = auth.uid()
  OR id IN (SELECT my_client_ids())
  OR id IN (SELECT my_shared_client_ids())
);

-- ── matters: no longer queries clients ──
DROP POLICY IF EXISTS matters_select ON matters;
CREATE POLICY matters_select ON matters FOR SELECT USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT firm_client_ids())
  OR client_id IN (SELECT my_client_ids())
  OR id IN (SELECT my_shared_matter_ids())
);

-- ── matters update/delete carried the same clients subquery from 011;
--    swap them to the helper too so no path can recurse. ──
DROP POLICY IF EXISTS matters_update ON matters;
CREATE POLICY matters_update ON matters FOR UPDATE USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT firm_client_ids())
  OR client_id IN (SELECT my_client_ids())
);

DROP POLICY IF EXISTS matters_delete ON matters;
CREATE POLICY matters_delete ON matters FOR DELETE USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT firm_client_ids())
  OR client_id IN (SELECT my_client_ids())
);

-- ── shared_tasks (013) also queried clients directly — same swap. ──
DROP POLICY IF EXISTS shared_tasks_select ON shared_tasks;
CREATE POLICY shared_tasks_select ON shared_tasks FOR SELECT USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT firm_client_ids())
  OR client_id IN (SELECT my_client_ids())
);

DROP POLICY IF EXISTS shared_tasks_insert ON shared_tasks;
CREATE POLICY shared_tasks_insert ON shared_tasks FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND (
    is_admin()
    OR client_id IN (SELECT firm_client_ids())
    OR client_id IN (SELECT my_client_ids())
  )
);

-- ── create_shared_task() validated access with a direct clients query;
--    route it through the helpers as well. ──
CREATE OR REPLACE FUNCTION create_shared_task(
  p_client_id UUID,
  p_matter_id UUID,
  p_title TEXT,
  p_entry_date DATE,
  p_duration_minutes INTEGER,
  p_description TEXT,
  p_category TEXT,
  p_is_billable BOOLEAN,
  p_source TEXT,
  p_applied_rate NUMERIC,
  p_participant_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shared_task_id UUID;
  v_participant UUID;
  v_has_access BOOLEAN;
BEGIN
  SELECT is_admin()
      OR p_client_id IN (SELECT firm_client_ids())
      OR p_client_id IN (SELECT my_client_ids())
      OR p_matter_id IN (SELECT my_shared_matter_ids())
      OR EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND created_by = auth.uid())
  INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'No tienes acceso a este cliente/asunto';
  END IF;

  IF NOT (auth.uid() = ANY(p_participant_ids)) THEN
    RAISE EXCEPTION 'El creador debe estar entre los participantes';
  END IF;

  INSERT INTO shared_tasks (client_id, matter_id, title, created_by)
  VALUES (p_client_id, p_matter_id, p_title, auth.uid())
  RETURNING id INTO v_shared_task_id;

  FOREACH v_participant IN ARRAY p_participant_ids LOOP
    INSERT INTO time_entries (
      user_id, client_id, matter_id, entry_date, duration_minutes,
      description, category, is_billable, source, applied_rate,
      billing_status, created_by, shared_task_id
    ) VALUES (
      v_participant, p_client_id, p_matter_id, p_entry_date, p_duration_minutes,
      p_description, p_category, p_is_billable, p_source, p_applied_rate,
      'draft', auth.uid(), v_shared_task_id
    );

    IF v_participant <> auth.uid() THEN
      INSERT INTO matter_shares (matter_id, user_id, granted_by)
      VALUES (p_matter_id, v_participant, auth.uid())
      ON CONFLICT (matter_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_shared_task_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_shared_task(UUID, UUID, TEXT, DATE, INTEGER, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, UUID[]) TO authenticated;
