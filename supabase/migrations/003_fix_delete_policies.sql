-- ═══════════════════════════════════════════
-- FIX: Add DELETE policies for clients and related tables
-- Also add 'project' to billing_type if needed in future
-- ═══════════════════════════════════════════

-- Allow any authenticated user to delete clients they created,
-- or admins can delete any client
CREATE POLICY clients_delete ON clients FOR DELETE USING (
  created_by = auth.uid() OR is_admin()
);

-- Allow delete on matters for client owner or admin
CREATE POLICY matters_delete ON matters FOR DELETE USING (
  created_by = auth.uid() OR is_admin()
);

-- Allow delete on client_contacts for admin or assignment holder
CREATE POLICY contacts_delete ON client_contacts FOR DELETE USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- Allow delete on client_billing_profiles for admin
CREATE POLICY billing_profiles_delete ON client_billing_profiles FOR DELETE USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- Allow delete on client_default_rates for admin or assignment holder
CREATE POLICY client_rates_delete ON client_default_rates FOR DELETE USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);

-- Allow delete on user_client_assignments for admin or the assigned user
CREATE POLICY assignments_delete ON user_client_assignments FOR DELETE USING (
  user_id = auth.uid() OR is_admin()
);

-- Note: time_entries already has entries_delete policy (super_admin only) from 002.
-- With OR semantics, attorney delete is still blocked unless we add another.
-- For client deletion cascade, the attorney needs to delete their OWN entries.
CREATE POLICY entries_delete_own ON time_entries FOR DELETE USING (
  user_id = auth.uid()
);
