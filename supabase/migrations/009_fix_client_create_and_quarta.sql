-- ═══════════════════════════════════════════
-- 009: Fix client creation for attorneys + firm-client governance
--
-- - BUG: clients_select lacked `created_by`, so INSERT ... RETURNING
--   could not read the just-created row → attorneys got an error when
--   creating a new client. Add created_by to the SELECT policy.
-- - Only super_admin may create/flag firm-wide (is_firm_client) clients.
-- - Attorneys may create normal clients freely (cap optional) and the
--   timer/quick-entry will see them via RLS.
-- - Seed "Asuntos Quarta": firm client with NO cap, to track each
--   attorney's administrative / pro-bono / internal Quarta hours.
-- ═══════════════════════════════════════════

-- ── SELECT: allow reading own freshly-created clients ──
DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT USING (
  is_admin()
  OR is_firm_client
  OR created_by = auth.uid()
  OR id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- ── INSERT: anyone can create normal clients; firm clients super_admin only ──
DROP POLICY IF EXISTS clients_insert ON clients;
CREATE POLICY clients_insert ON clients FOR INSERT WITH CHECK (
  is_firm_client = false OR is_super_admin()
);

-- ── Matters SELECT: allow reading own freshly-created matters ──
DROP POLICY IF EXISTS matters_select ON matters;
CREATE POLICY matters_select ON matters FOR SELECT USING (
  is_admin()
  OR created_by = auth.uid()
  OR client_id IN (SELECT id FROM clients WHERE is_firm_client)
  OR client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- ── Seed "Asuntos Quarta" (firm client, no cap) ──
INSERT INTO clients (name, billing_type, monthly_hour_cap, nit, is_firm_client, is_active)
SELECT 'Asuntos Quarta', 'hourly', NULL, NULL, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.name = 'Asuntos Quarta' AND c.is_firm_client = true
);
