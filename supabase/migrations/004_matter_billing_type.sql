-- ═══════════════════════════════════════════
-- Move billing logic from client to matter level
-- Client billing_type becomes the DEFAULT for new matters
-- Each matter can override with its own billing_type
-- ═══════════════════════════════════════════

-- Add billing columns to matters
ALTER TABLE matters
  ADD COLUMN billing_type TEXT DEFAULT 'hourly' CHECK (billing_type IN ('fee', 'hourly', 'project')),
  ADD COLUMN hour_cap INTEGER,
  ADD COLUMN fixed_fee DECIMAL(12,2);

-- Backfill existing matters: inherit from parent client
UPDATE matters m
SET billing_type = c.billing_type,
    hour_cap = CASE WHEN c.billing_type = 'fee' THEN c.monthly_hour_cap ELSE NULL END
FROM clients c
WHERE m.client_id = c.id;

-- Comment: client.billing_type stays as default hint for new matters
-- but the authoritative billing_type is now on matters
