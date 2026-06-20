-- ═══════════════════════════════════════════
-- 012: Admin report RPC — flat rows, no RLS fragility
--
-- The reports page joined users/clients/matters via PostgREST embeds under
-- RLS, which intermittently returned 0 rows. This SECURITY DEFINER function
-- returns every entry in the range (admins only) already joined to names —
-- simple, fast, and immune to embed/RLS quirks.
-- ═══════════════════════════════════════════

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
  applied_rate NUMERIC
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    te.entry_date, te.user_id, te.client_id, te.matter_id,
    u.full_name, c.name, m.name, m.billing_type,
    te.duration_minutes, te.is_billable, te.category::TEXT, te.source::TEXT,
    te.description, m.hourly_rate, m.fixed_fee, m.hour_cap, te.applied_rate
  FROM time_entries te
  LEFT JOIN users   u ON u.id = te.user_id
  LEFT JOIN clients c ON c.id = te.client_id
  LEFT JOIN matters m ON m.id = te.matter_id
  WHERE te.entry_date >= p_from
    AND te.entry_date <= p_to
    AND is_admin()
  ORDER BY te.entry_date;
$$;
GRANT EXECUTE ON FUNCTION report_time_entries(DATE, DATE) TO authenticated;
