-- ═══════════════════════════════════════════
-- Add allocated_hours and hourly_rate to matters
-- allocated_hours: horas destinadas al asunto (all billing types)
-- hourly_rate: valor de la hora COP (only for pospago/hourly)
-- ═══════════════════════════════════════════

ALTER TABLE matters
  ADD COLUMN IF NOT EXISTS allocated_hours DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(12,2);
