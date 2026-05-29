import type { ClientDefaultRate, MatterRateOverride } from '@/lib/types'

interface RateResolverParams {
  manualRate?: number | null
  matterOverrides?: MatterRateOverride[]
  clientDefaults?: ClientDefaultRate[]
  date?: Date
}

/**
 * Resolves the applicable rate following priority:
 * 1. Manual override on entry
 * 2. Matter-level override (active on date)
 * 3. Client default rate (active on date)
 * 4. null (no rate configured)
 */
export function resolveRate({
  manualRate,
  matterOverrides = [],
  clientDefaults = [],
  date = new Date(),
}: RateResolverParams): number | null {
  if (manualRate != null && manualRate > 0) return manualRate

  const dateStr = date.toISOString().split('T')[0]

  const activeMatterRate = matterOverrides.find(
    (r) =>
      r.effective_from <= dateStr &&
      (r.effective_to === null || r.effective_to >= dateStr)
  )
  if (activeMatterRate) return activeMatterRate.hourly_rate

  const activeClientRate = clientDefaults.find(
    (r) =>
      r.effective_from <= dateStr &&
      (r.effective_to === null || r.effective_to >= dateStr)
  )
  if (activeClientRate) return activeClientRate.hourly_rate

  return null
}
