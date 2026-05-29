-- ═══════════════════════════════════════════
-- FIX: Sync users.id with auth.users.id
-- Problem: users.id was gen_random_uuid(), but RLS checks auth.uid()
-- All time_entries, timer_sessions etc. need user_id = auth.uid()
-- ═══════════════════════════════════════════

-- Step 1: Update users.id to match auth.users.id (matched by email)
-- This cascades through all FK references thanks to ON UPDATE CASCADE (if set)
-- Since we don't have CASCADE on UPDATE, we need to update FKs manually

-- First, create temp mapping table
CREATE TEMP TABLE user_id_map AS
SELECT u.id AS old_id, au.id AS new_id, u.email
FROM users u
JOIN auth.users au ON au.email = u.email;

-- Update all FK references BEFORE changing users.id

-- user_preferences
UPDATE user_preferences SET user_id = m.new_id
FROM user_id_map m WHERE user_preferences.user_id = m.old_id;

-- user_client_assignments
UPDATE user_client_assignments SET user_id = m.new_id
FROM user_id_map m WHERE user_client_assignments.user_id = m.old_id;

-- time_entries.user_id
UPDATE time_entries SET user_id = m.new_id
FROM user_id_map m WHERE time_entries.user_id = m.old_id;

-- time_entries.created_by
UPDATE time_entries SET created_by = m.new_id
FROM user_id_map m WHERE time_entries.created_by = m.old_id;

-- timer_sessions.user_id
UPDATE timer_sessions SET user_id = m.new_id
FROM user_id_map m WHERE timer_sessions.user_id = m.old_id;

-- clients.created_by
UPDATE clients SET created_by = m.new_id
FROM user_id_map m WHERE clients.created_by = m.old_id;

-- matters.created_by
UPDATE matters SET created_by = m.new_id
FROM user_id_map m WHERE matters.created_by = m.old_id;

-- notifications.user_id
UPDATE notifications SET user_id = m.new_id
FROM user_id_map m WHERE notifications.user_id = m.old_id;

-- audit_events.user_id
UPDATE audit_events SET user_id = m.new_id
FROM user_id_map m WHERE audit_events.user_id = m.old_id;

-- billing_batch_items (via billing_batches)
-- These probably don't have user_id directly

-- time_entry_edit_history.edited_by
UPDATE time_entry_edit_history SET edited_by = m.new_id
FROM user_id_map m WHERE time_entry_edit_history.edited_by = m.old_id;

-- Now update users.id itself
UPDATE users SET id = m.new_id
FROM user_id_map m WHERE users.id = m.old_id;

-- Step 2: Create trigger so new auth signups auto-create users row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'attorney'
  )
  ON CONFLICT (email) DO UPDATE SET id = NEW.id;

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TABLE IF EXISTS user_id_map;
