-- ═══════════════════════════════════════════
-- 013: Shared tasks — co-registro de horas entre abogados
--
-- Additive only. Nothing existing changes behavior:
--   - time_entries.shared_task_id is nullable, defaults NULL for every
--     existing row and every entry created through the normal (non-shared)
--     Quick Entry flow.
--   - shared_tasks is a brand-new table; nothing reads it yet until the
--     UI opts in.
--   - Each attorney still gets their OWN time_entries row (own cap/billing
--     math untouched) — shared_task_id just links rows that represent the
--     same underlying activity so the UI can group them for display.
--
-- RLS follows the my_client_ids() SECURITY DEFINER pattern from 011 to
-- avoid the self-referencing-policy recursion bug that broke the app once
-- already. shared_tasks policies never sub-query shared_tasks itself.
-- ═══════════════════════════════════════════

CREATE TABLE shared_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  matter_id     UUID REFERENCES matters(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE time_entries ADD COLUMN shared_task_id UUID REFERENCES shared_tasks(id) ON DELETE SET NULL;
CREATE INDEX idx_time_entries_shared_task ON time_entries(shared_task_id) WHERE shared_task_id IS NOT NULL;

ALTER TABLE shared_tasks ENABLE ROW LEVEL SECURITY;

-- Visible to: admins, the creator, or anyone assigned to the client (own
-- assignments or firm-wide clients) — same visibility rule as matters.
CREATE POLICY shared_tasks_select ON shared_tasks FOR SELECT USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT my_client_ids())
);

CREATE POLICY shared_tasks_insert ON shared_tasks FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND (
    is_admin()
    OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
    OR client_id IN (SELECT my_client_ids())
  )
);

CREATE POLICY shared_tasks_delete ON shared_tasks FOR DELETE USING (
  is_admin() OR created_by = auth.uid()
);

GRANT SELECT, INSERT, DELETE ON shared_tasks TO authenticated;
