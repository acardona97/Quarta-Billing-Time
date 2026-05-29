-- ═══════════════════════════════════════════
-- QUARTA BILLING TIME — INITIAL SCHEMA
-- ═══════════════════════════════════════════

-- IDENTITY MODULE
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'attorney'
                    CHECK (role IN ('super_admin', 'partner_admin', 'attorney')),
  is_active         BOOLEAN DEFAULT true,
  avatar_url        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_preferences (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  daily_hour_goal         INTEGER DEFAULT 360,
  default_billable        BOOLEAN DEFAULT true,
  notification_push       BOOLEAN DEFAULT true,
  notification_email      BOOLEAN DEFAULT false,
  theme                   TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  self_edit_window_days   INTEGER DEFAULT 7,
  reconciliation_time     TEXT DEFAULT '17:30',
  streak_current          INTEGER DEFAULT 0,
  streak_best             INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- CLIENT MANAGEMENT MODULE
CREATE TABLE clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  billing_type      TEXT NOT NULL CHECK (billing_type IN ('fee', 'hourly')),
  monthly_hour_cap  INTEGER,
  is_active         BOOLEAN DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID REFERENCES users(id)
);

CREATE TABLE client_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  contact_name      TEXT,
  contact_email     TEXT,
  contact_domain    TEXT,
  is_primary        BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_billing_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  default_currency    TEXT DEFAULT 'COP',
  payment_terms_days  INTEGER DEFAULT 30,
  tax_id              TEXT,
  billing_address     TEXT,
  billing_email       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- MATTER MANAGEMENT MODULE
CREATE TABLE matters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT 'General',
  description       TEXT,
  is_default        BOOLEAN DEFAULT false,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID REFERENCES users(id)
);

CREATE TABLE matter_rate_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id         UUID REFERENCES matters(id) ON DELETE CASCADE,
  hourly_rate       DECIMAL(12,2) NOT NULL,
  currency          TEXT DEFAULT 'COP',
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_default_rates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  hourly_rate       DECIMAL(12,2) NOT NULL,
  currency          TEXT DEFAULT 'COP',
  effective_from    DATE NOT NULL,
  effective_to      DATE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ATTORNEY-CLIENT ASSIGNMENTS
CREATE TABLE user_client_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, client_id)
);

-- TIME CAPTURE MODULE
CREATE TABLE time_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  matter_id         UUID REFERENCES matters(id) ON DELETE CASCADE,
  entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  description       TEXT,
  category          TEXT CHECK (category IN ('meeting', 'call', 'drafting', 'review', 'research', 'email', 'other')),
  is_billable       BOOLEAN DEFAULT true,
  source            TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'outlook', 'teams', 'reconciliation')),
  applied_rate      DECIMAL(12,2),
  billing_status    TEXT DEFAULT 'draft' CHECK (billing_status IN ('draft', 'reviewed', 'approved', 'invoiced')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID REFERENCES users(id)
);

CREATE TABLE time_entry_edit_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id     UUID REFERENCES time_entries(id) ON DELETE CASCADE,
  edited_by         UUID REFERENCES users(id),
  field_changed     TEXT NOT NULL,
  old_value         TEXT,
  new_value         TEXT,
  edit_reason       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE timer_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  client_id             UUID REFERENCES clients(id),
  matter_id             UUID REFERENCES matters(id),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  description           TEXT,
  category              TEXT CHECK (category IN ('meeting', 'call', 'drafting', 'review', 'research', 'email', 'other')),
  is_running            BOOLEAN DEFAULT true,
  paused_at             TIMESTAMPTZ,
  accumulated_seconds   INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- CONTEXTUAL CAPTURE MODULE (Phase 2 ready)
CREATE TABLE activity_signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  signal_type       TEXT NOT NULL,
  signal_source     TEXT,
  metadata          JSONB NOT NULL,
  matched_client_id UUID REFERENCES clients(id),
  matched_matter_id UUID REFERENCES matters(id),
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'dismissed', 'expired')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE TABLE suggested_captures (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id                 UUID REFERENCES activity_signals(id) ON DELETE CASCADE,
  user_id                   UUID REFERENCES users(id) ON DELETE CASCADE,
  suggested_client_id       UUID REFERENCES clients(id),
  suggested_matter_id       UUID REFERENCES matters(id),
  suggested_duration_minutes INTEGER,
  suggested_description     TEXT,
  suggested_category        TEXT,
  confidence_score          DECIMAL(3,2),
  status                    TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'modified', 'dismissed')),
  created_at                TIMESTAMPTZ DEFAULT now(),
  resolved_at               TIMESTAMPTZ
);

-- NOTIFICATIONS MODULE
CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  payload           JSONB,
  priority          TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status            TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'actioned', 'dismissed')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  read_at           TIMESTAMPTZ,
  actioned_at       TIMESTAMPTZ
);

CREATE TABLE notification_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id   UUID REFERENCES notifications(id) ON DELETE CASCADE,
  action_type       TEXT NOT NULL,
  action_data       JSONB,
  performed_at      TIMESTAMPTZ DEFAULT now()
);

-- BILLING MODULE (Phase 4 — schema only)
CREATE TABLE billing_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'exported', 'invoiced')),
  total_minutes     INTEGER,
  total_amount      DECIMAL(14,2),
  currency          TEXT DEFAULT 'COP',
  created_by        UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE billing_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID REFERENCES billing_batches(id) ON DELETE CASCADE,
  time_entry_id     UUID REFERENCES time_entries(id),
  attorney_name     TEXT NOT NULL,
  matter_name       TEXT NOT NULL,
  entry_date        DATE NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  description       TEXT,
  applied_rate      DECIMAL(12,2),
  line_total        DECIMAL(14,2),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,
  entity_id         UUID NOT NULL,
  requested_by      UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comments          TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE TABLE invoice_exports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID REFERENCES billing_batches(id),
  export_target     TEXT DEFAULT 'siigo',
  export_data       JSONB,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'exported', 'failed')),
  external_id       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- INTEGRATIONS MODULE (Phase 2 ready)
CREATE TABLE integration_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL,
  status            TEXT DEFAULT 'disconnected',
  config            JSONB,
  connected_by      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE integration_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id),
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhook_subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id),
  resource          TEXT NOT NULL,
  subscription_id   TEXT,
  expiration_at     TIMESTAMPTZ,
  status            TEXT DEFAULT 'active',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- AI MODULE (Phase 4 ready)
CREATE TABLE ai_provider_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL,
  api_key_encrypted TEXT,
  model_id          TEXT,
  is_active         BOOLEAN DEFAULT false,
  config            JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- AUDIT & SECURITY MODULE
CREATE TABLE audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by      UUID REFERENCES users(id),
  action            TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         UUID NOT NULL,
  old_value         JSONB,
  new_value         JSONB,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE security_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,
  user_id           UUID REFERENCES users(id),
  ip_address        TEXT,
  user_agent        TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, entry_date);
CREATE INDEX idx_time_entries_client ON time_entries(client_id);
CREATE INDEX idx_time_entries_billing_status ON time_entries(billing_status);
CREATE INDEX idx_timer_sessions_user_running ON timer_sessions(user_id, is_running);
CREATE INDEX idx_matters_client ON matters(client_id);
CREATE INDEX idx_user_client_assignments_user ON user_client_assignments(user_id);
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_activity_signals_user_status ON activity_signals(user_id, status);

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_client_billing_profiles_updated_at BEFORE UPDATE ON client_billing_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_time_entries_updated_at BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_billing_batches_updated_at BEFORE UPDATE ON billing_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_integration_connections_updated_at BEFORE UPDATE ON integration_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_integration_tokens_updated_at BEFORE UPDATE ON integration_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_webhook_subscriptions_updated_at BEFORE UPDATE ON webhook_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_provider_configs_updated_at BEFORE UPDATE ON ai_provider_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
