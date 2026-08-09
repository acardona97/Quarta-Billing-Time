-- ═══════════════════════════════════════════
-- 018: Per-matter consumption for an arbitrary month + all-time total
--
-- The clients page only ever showed the CURRENT month
-- (matter_consumption_current_month), so work logged in a previous month
-- looked like it had vanished from a matter — the rows were always there,
-- just filtered out.
--
-- Additive: two NEW functions. matter_consumption_current_month() is left
-- untouched so anything still calling it keeps working.
-- Both respect counts_towards_cap so shared hours are counted once.
-- ═══════════════════════════════════════════

-- Consumption for the calendar month containing p_month (any day works).
CREATE OR REPLACE FUNCTION matter_consumption_for_month(p_month DATE)
RETURNS TABLE(matter_id UUID, total_minutes BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT te.matter_id, COALESCE(SUM(te.duration_minutes), 0)::BIGINT
  FROM time_entries te
  WHERE te.entry_date >= date_trunc('month', p_month)::date
    AND te.entry_date <  (date_trunc('month', p_month) + INTERVAL '1 month')::date
    AND te.counts_towards_cap
  GROUP BY te.matter_id;
$$;
GRANT EXECUTE ON FUNCTION matter_consumption_for_month(DATE) TO authenticated;

-- All-time consumption per matter (no date filter).
CREATE OR REPLACE FUNCTION matter_consumption_all_time()
RETURNS TABLE(matter_id UUID, total_minutes BIGINT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT te.matter_id, COALESCE(SUM(te.duration_minutes), 0)::BIGINT
  FROM time_entries te
  WHERE te.counts_towards_cap
  GROUP BY te.matter_id;
$$;
GRANT EXECUTE ON FUNCTION matter_consumption_all_time() TO authenticated;
