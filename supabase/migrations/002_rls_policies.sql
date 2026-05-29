-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_rate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_default_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entry_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE timer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggested_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's role from users table
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is admin (super_admin or partner_admin)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT role IN ('super_admin', 'partner_admin') FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'super_admin' FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════
CREATE POLICY users_select ON users FOR SELECT USING (
  id = auth.uid() OR is_admin()
);
CREATE POLICY users_update ON users FOR UPDATE USING (
  is_super_admin()
);

-- ═══════════════════════════════════════════
-- USER PREFERENCES
-- ═══════════════════════════════════════════
CREATE POLICY prefs_select ON user_preferences FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY prefs_insert ON user_preferences FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY prefs_update ON user_preferences FOR UPDATE USING (
  user_id = auth.uid()
);

-- ═══════════════════════════════════════════
-- CLIENTS — attorneys see assigned clients, admins see all
-- ═══════════════════════════════════════════
CREATE POLICY clients_select ON clients FOR SELECT USING (
  is_admin() OR
  id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY clients_insert ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY clients_update ON clients FOR UPDATE USING (is_admin());

-- ═══════════════════════════════════════════
-- CLIENT CONTACTS
-- ═══════════════════════════════════════════
CREATE POLICY contacts_select ON client_contacts FOR SELECT USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY contacts_insert ON client_contacts FOR INSERT WITH CHECK (true);
CREATE POLICY contacts_update ON client_contacts FOR UPDATE USING (is_admin());

-- ═══════════════════════════════════════════
-- CLIENT BILLING PROFILES
-- ═══════════════════════════════════════════
CREATE POLICY billing_profiles_select ON client_billing_profiles FOR SELECT USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY billing_profiles_manage ON client_billing_profiles FOR ALL USING (is_admin());

-- ═══════════════════════════════════════════
-- MATTERS
-- ═══════════════════════════════════════════
CREATE POLICY matters_select ON matters FOR SELECT USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY matters_insert ON matters FOR INSERT WITH CHECK (true);
CREATE POLICY matters_update ON matters FOR UPDATE USING (
  is_admin() OR created_by = auth.uid()
);

-- ═══════════════════════════════════════════
-- RATES
-- ═══════════════════════════════════════════
CREATE POLICY matter_rates_select ON matter_rate_overrides FOR SELECT USING (
  is_admin() OR
  matter_id IN (
    SELECT m.id FROM matters m
    JOIN user_client_assignments uca ON uca.client_id = m.client_id
    WHERE uca.user_id = auth.uid() AND uca.is_active = true
  )
);
CREATE POLICY matter_rates_manage ON matter_rate_overrides FOR INSERT WITH CHECK (true);

CREATE POLICY client_rates_select ON client_default_rates FOR SELECT USING (
  is_admin() OR
  client_id IN (SELECT client_id FROM user_client_assignments WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY client_rates_manage ON client_default_rates FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════
-- USER CLIENT ASSIGNMENTS
-- ═══════════════════════════════════════════
CREATE POLICY assignments_select ON user_client_assignments FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY assignments_manage ON user_client_assignments FOR ALL USING (is_admin());

-- ═══════════════════════════════════════════
-- TIME ENTRIES — attorney sees own, admins see all
-- ═══════════════════════════════════════════
CREATE POLICY entries_select ON time_entries FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY entries_insert ON time_entries FOR INSERT WITH CHECK (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY entries_update ON time_entries FOR UPDATE USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY entries_delete ON time_entries FOR DELETE USING (
  is_super_admin()
);

-- ═══════════════════════════════════════════
-- TIME ENTRY EDIT HISTORY
-- ═══════════════════════════════════════════
CREATE POLICY edit_history_select ON time_entry_edit_history FOR SELECT USING (
  is_admin() OR
  time_entry_id IN (SELECT id FROM time_entries WHERE user_id = auth.uid())
);
CREATE POLICY edit_history_insert ON time_entry_edit_history FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════
-- TIMER SESSIONS
-- ═══════════════════════════════════════════
CREATE POLICY timers_select ON timer_sessions FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY timers_insert ON timer_sessions FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY timers_update ON timer_sessions FOR UPDATE USING (
  user_id = auth.uid()
);
CREATE POLICY timers_delete ON timer_sessions FOR DELETE USING (
  user_id = auth.uid()
);

-- ═══════════════════════════════════════════
-- ACTIVITY SIGNALS & SUGGESTED CAPTURES
-- ═══════════════════════════════════════════
CREATE POLICY signals_select ON activity_signals FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY signals_insert ON activity_signals FOR INSERT WITH CHECK (true);
CREATE POLICY signals_update ON activity_signals FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE POLICY captures_select ON suggested_captures FOR SELECT USING (
  user_id = auth.uid() OR is_admin()
);
CREATE POLICY captures_insert ON suggested_captures FOR INSERT WITH CHECK (true);
CREATE POLICY captures_update ON suggested_captures FOR UPDATE USING (
  user_id = auth.uid()
);

-- ═══════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════
CREATE POLICY notifs_select ON notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY notifs_insert ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY notifs_update ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE POLICY notif_actions_select ON notification_actions FOR SELECT USING (
  notification_id IN (SELECT id FROM notifications WHERE user_id = auth.uid())
);
CREATE POLICY notif_actions_insert ON notification_actions FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════
-- BILLING (admin only for now)
-- ═══════════════════════════════════════════
CREATE POLICY batches_select ON billing_batches FOR SELECT USING (is_admin());
CREATE POLICY batches_manage ON billing_batches FOR ALL USING (is_admin());

CREATE POLICY line_items_select ON billing_line_items FOR SELECT USING (is_admin());
CREATE POLICY line_items_manage ON billing_line_items FOR ALL USING (is_admin());

CREATE POLICY approvals_select ON approvals FOR SELECT USING (
  requested_by = auth.uid() OR is_admin()
);
CREATE POLICY approvals_manage ON approvals FOR ALL USING (is_admin());

-- ═══════════════════════════════════════════
-- AUDIT & SECURITY — admin only
-- ═══════════════════════════════════════════
CREATE POLICY audit_select ON audit_events FOR SELECT USING (is_admin());
CREATE POLICY audit_insert ON audit_events FOR INSERT WITH CHECK (true);

CREATE POLICY security_select ON security_events FOR SELECT USING (is_super_admin());
CREATE POLICY security_insert ON security_events FOR INSERT WITH CHECK (true);
