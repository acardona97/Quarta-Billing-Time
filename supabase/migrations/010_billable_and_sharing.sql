-- ═══════════════════════════════════════════
-- 010: Per-matter billable flag + attorney-to-attorney client sharing
-- ═══════════════════════════════════════════

-- ── Asunto facturable o no (independiente de la modalidad) ──
ALTER TABLE matters ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT true;

-- ── Compartir clientes entre abogados sin intervención del admin ──
-- Un abogado ya asignado a un cliente puede agregar a otro abogado.
-- (Permissive, se suma a la política de admin existente — no quita nada.)
DROP POLICY IF EXISTS assignments_insert ON user_client_assignments;
CREATE POLICY assignments_insert ON user_client_assignments FOR INSERT WITH CHECK (
  is_admin()
  OR user_id = auth.uid()
  OR client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- Ver con quién está compartido un cliente propio (para listar co-abogados)
DROP POLICY IF EXISTS assignments_select ON user_client_assignments;
CREATE POLICY assignments_select ON user_client_assignments FOR SELECT USING (
  user_id = auth.uid()
  OR is_admin()
  OR client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- ── Listar abogados activos (para el selector de "compartir") ──
-- Solo id + nombre, vía SECURITY DEFINER (users_select normal no deja ver colegas).
CREATE OR REPLACE FUNCTION list_attorneys()
RETURNS TABLE(id UUID, full_name TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, full_name FROM users WHERE is_active = true ORDER BY full_name;
$$;
GRANT EXECUTE ON FUNCTION list_attorneys() TO authenticated;
