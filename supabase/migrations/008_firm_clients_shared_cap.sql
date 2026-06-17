-- ═══════════════════════════════════════════
-- 008: Firm-wide precreated clients + shared monthly cap
--
-- - Cap lives on CLIENT (monthly_hour_cap, in minutes), shared by all
--   fee matters of the client and consumed by all attorneys.
-- - Cap resets monthly (calendar) or when exhausted — handled statelessly
--   in the app (sum this calendar month, modulo cap).
-- - Firm clients (is_firm_client) are visible to everyone and only
--   super_admin can edit/delete them.
-- - Shared consumption is exposed via a SECURITY DEFINER RPC so any
--   attorney sees the firm-wide total without breaking row-level isolation.
-- ═══════════════════════════════════════════

-- ── New columns on clients ──────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS nit TEXT,
  ADD COLUMN IF NOT EXISTS is_firm_client BOOLEAN NOT NULL DEFAULT false;

-- ── Visibility: firm clients visible to all ─
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT USING (
  is_admin()
  OR is_firm_client
  OR id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- ── Update: anyone assigned/creator/admin; firm clients super_admin only ─
DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients FOR UPDATE USING (
  CASE WHEN is_firm_client THEN is_super_admin()
       ELSE (
         is_admin()
         OR created_by = auth.uid()
         OR id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
       )
  END
);

-- ── Delete: same gating; firm clients super_admin only ─
DROP POLICY IF EXISTS clients_delete ON clients;
CREATE POLICY clients_delete ON clients FOR DELETE USING (
  CASE WHEN is_firm_client THEN is_super_admin()
       ELSE (
         is_admin()
         OR created_by = auth.uid()
         OR id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
       )
  END
);

-- ── Matters: extend visibility/edit/delete to firm clients ─
DROP POLICY IF EXISTS matters_select ON matters;
CREATE POLICY matters_select ON matters FOR SELECT USING (
  is_admin()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

DROP POLICY IF EXISTS matters_update ON matters;
CREATE POLICY matters_update ON matters FOR UPDATE USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

DROP POLICY IF EXISTS matters_delete ON matters;
CREATE POLICY matters_delete ON matters FOR DELETE USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- ── Shared consumption RPC (firm-wide, current calendar month, Bogota) ─
-- Returns total minutes per matter across ALL attorneys. Totals only —
-- no row detail — so row-level isolation of individual entries is preserved.
CREATE OR REPLACE FUNCTION matter_consumption_current_month()
RETURNS TABLE(matter_id UUID, total_minutes BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT te.matter_id, COALESCE(SUM(te.duration_minutes), 0)::BIGINT
  FROM time_entries te
  WHERE te.entry_date >= date_trunc('month', timezone('America/Bogota', now()))::date
  GROUP BY te.matter_id;
$$;
GRANT EXECUTE ON FUNCTION matter_consumption_current_month() TO authenticated;

-- ── Seed the 11 firm-wide fee clients (idempotent by name) ──
INSERT INTO clients (name, billing_type, monthly_hour_cap, nit, is_firm_client, is_active)
SELECT v.name, 'fee', v.cap_minutes, v.nit, true, true
FROM (VALUES
  ('GLUKY',                  900,  '900126415'),
  ('HWI',                    2040, '900666078'),
  ('FIERA',                  600,  '900072392'),
  ('LINXUS',                 900,  '901438589'),
  ('TRASEGAR',               600,  '800172301'),
  ('HOLDING BC',             600,  '900656261'),
  ('PQP',                    720,  '860042141'),
  ('BPOZEN',                 960,  '901791898'),
  ('ACCELÍRATE',             600,  '901033369'),
  ('INDUSTRIAS DEL HIERRO',  300,  '890940621'),
  ('AGRIMATCO LIMITED',      390,  '12040171B')
) AS v(name, cap_minutes, nit)
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.name = v.name AND c.is_firm_client = true
);
