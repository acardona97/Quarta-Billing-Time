-- Fix missing ON DELETE CASCADE for client_id FKs
-- These block client deletion

-- timer_sessions.client_id
ALTER TABLE timer_sessions DROP CONSTRAINT IF EXISTS timer_sessions_client_id_fkey;
ALTER TABLE timer_sessions ADD CONSTRAINT timer_sessions_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- timer_sessions.matter_id
ALTER TABLE timer_sessions DROP CONSTRAINT IF EXISTS timer_sessions_matter_id_fkey;
ALTER TABLE timer_sessions ADD CONSTRAINT timer_sessions_matter_id_fkey
  FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE CASCADE;

-- activity_signals.matched_client_id
ALTER TABLE activity_signals DROP CONSTRAINT IF EXISTS activity_signals_matched_client_id_fkey;
ALTER TABLE activity_signals ADD CONSTRAINT activity_signals_matched_client_id_fkey
  FOREIGN KEY (matched_client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- activity_signals.matched_matter_id
ALTER TABLE activity_signals DROP CONSTRAINT IF EXISTS activity_signals_matched_matter_id_fkey;
ALTER TABLE activity_signals ADD CONSTRAINT activity_signals_matched_matter_id_fkey
  FOREIGN KEY (matched_matter_id) REFERENCES matters(id) ON DELETE SET NULL;

-- suggested_captures.suggested_client_id
ALTER TABLE suggested_captures DROP CONSTRAINT IF EXISTS suggested_captures_suggested_client_id_fkey;
ALTER TABLE suggested_captures ADD CONSTRAINT suggested_captures_suggested_client_id_fkey
  FOREIGN KEY (suggested_client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- suggested_captures.suggested_matter_id
ALTER TABLE suggested_captures DROP CONSTRAINT IF EXISTS suggested_captures_suggested_matter_id_fkey;
ALTER TABLE suggested_captures ADD CONSTRAINT suggested_captures_suggested_matter_id_fkey
  FOREIGN KEY (suggested_matter_id) REFERENCES matters(id) ON DELETE SET NULL;
