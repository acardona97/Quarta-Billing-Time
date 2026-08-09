-- ═══════════════════════════════════════════
-- 014: Fix shared tasks — matter-level access + working insert
--
-- Two bugs found after 013 shipped:
--
-- 1. entries_insert policy requires user_id = auth.uid(). The Quick Entry
--    modal tried to insert one row per collaborator directly from the
--    client, so every row except the creator's own violated RLS and the
--    whole insert failed for non-admin attorneys — nothing was ever saved.
--
-- 2. Client sharing (user_client_assignments) grants the WHOLE client, not
--    a specific matter. A collaborator added to a shared task had no way
--    to see that one matter unless someone had already shared the entire
--    client with them.
--
-- Fix: a SECURITY DEFINER RPC does both the multi-user insert (bypassing
-- the per-row ownership check, but only after validating the caller
-- already has legitimate access to the client/matter) AND grants each
-- collaborator standing access to that ONE matter via a new matter_shares
-- table — additive OR clause on clients_select/matters_select, following
-- the my_client_ids() pattern from 011 (no self-referencing policies).
-- ═══════════════════════════════════════════

CREATE TABLE matter_shares (
  matter_id   UUID REFERENCES matters(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (matter_id, user_id)
);

ALTER TABLE matter_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY matter_shares_select ON matter_shares FOR SELECT USING (
  user_id = auth.uid() OR granted_by = auth.uid() OR is_admin()
);
GRANT SELECT ON matter_shares TO authenticated;

CREATE OR REPLACE FUNCTION my_shared_matter_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT matter_id FROM matter_shares WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION my_shared_matter_ids() TO authenticated;

-- Extend visibility: a client/matter is also visible if the caller has a
-- matter-level share on it. Additive OR — nothing removed from 011.
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT USING (
  is_admin()
  OR is_firm_client
  OR created_by = auth.uid()
  OR id IN (SELECT my_client_ids())
  OR id IN (SELECT client_id FROM matters WHERE id IN (SELECT my_shared_matter_ids()))
);

DROP POLICY IF EXISTS matters_select ON matters;
CREATE POLICY matters_select ON matters FOR SELECT USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT my_client_ids())
  OR id IN (SELECT my_shared_matter_ids())
);

-- ── The RPC: create a shared task + one time_entries row per participant
--    + a standing matter_shares grant for every collaborator. ──
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
  -- Caller must already have legitimate access to this client/matter —
  -- same rule as matters_select, checked explicitly since SECURITY DEFINER
  -- bypasses RLS.
  SELECT is_admin()
      OR EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND is_firm_client)
      OR p_client_id IN (SELECT my_client_ids())
      OR p_matter_id IN (SELECT my_shared_matter_ids())
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
