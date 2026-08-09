-- ═══════════════════════════════════════════
-- 016: Shared task hours — count once for the client, fully for each attorney
--
-- Case reported: Ana and Sofía spend 2h together in a meeting with a
-- client. Each should show 2h of personal work (productivity, ranking),
-- but the CLIENT / cap / matter should only be debited 2h total, not 4h.
--
-- Fix: counts_towards_cap flags exactly one of the shared entries (the
-- creator's) as the one that counts toward client/cap/billing totals; the
-- collaborators' rows still exist with the full duration (their personal
-- hours are real) but are excluded from client-facing sums. Every entry
-- created through the normal (non-shared) flow defaults to true — zero
-- behavior change there.
-- ═══════════════════════════════════════════

ALTER TABLE time_entries ADD COLUMN counts_towards_cap BOOLEAN NOT NULL DEFAULT true;

-- Cap consumption must not double-count shared hours.
CREATE OR REPLACE FUNCTION matter_consumption_current_month()
RETURNS TABLE(matter_id UUID, total_minutes BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT te.matter_id, COALESCE(SUM(te.duration_minutes), 0)::BIGINT
  FROM time_entries te
  WHERE te.entry_date >= date_trunc('month', timezone('America/Bogota', now()))::date
    AND te.counts_towards_cap
  GROUP BY te.matter_id;
$$;

-- Reports need to know which rows count for client/cap/billing totals vs
-- which are a collaborator's personal-hours copy of a shared task.
CREATE OR REPLACE FUNCTION report_time_entries(p_from DATE, p_to DATE)
RETURNS TABLE(
  entry_date DATE,
  user_id UUID,
  client_id UUID,
  matter_id UUID,
  user_name TEXT,
  client_name TEXT,
  matter_name TEXT,
  billing_type TEXT,
  duration_minutes INTEGER,
  is_billable BOOLEAN,
  category TEXT,
  source TEXT,
  description TEXT,
  hourly_rate NUMERIC,
  fixed_fee NUMERIC,
  hour_cap INTEGER,
  applied_rate NUMERIC,
  counts_towards_cap BOOLEAN
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    te.entry_date, te.user_id, te.client_id, te.matter_id,
    u.full_name, c.name, m.name, m.billing_type,
    te.duration_minutes, te.is_billable, te.category::TEXT, te.source::TEXT,
    te.description, m.hourly_rate, m.fixed_fee, m.hour_cap, te.applied_rate,
    te.counts_towards_cap
  FROM time_entries te
  LEFT JOIN users   u ON u.id = te.user_id
  LEFT JOIN clients c ON c.id = te.client_id
  LEFT JOIN matters m ON m.id = te.matter_id
  WHERE te.entry_date >= p_from
    AND te.entry_date <= p_to
    AND is_admin()
  ORDER BY te.entry_date;
$$;

-- create_shared_task(): first participant (the creator, per the frontend's
-- [userId, ...collaboratorIds] ordering) is the one whose hours count
-- toward the client/cap; everyone else's row is real (their own hours,
-- visible to them, counted in their personal stats) but excluded from
-- client/cap/billing totals.
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
  v_idx INTEGER := 0;
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
      billing_status, created_by, shared_task_id, counts_towards_cap
    ) VALUES (
      v_participant, p_client_id, p_matter_id, p_entry_date, p_duration_minutes,
      p_description, p_category, p_is_billable, p_source, p_applied_rate,
      'draft', auth.uid(), v_shared_task_id, (v_idx = 0)
    );

    IF v_participant <> auth.uid() THEN
      INSERT INTO matter_shares (matter_id, user_id, granted_by)
      VALUES (p_matter_id, v_participant, auth.uid())
      ON CONFLICT (matter_id, user_id) DO NOTHING;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_shared_task_id;
END;
$$;
