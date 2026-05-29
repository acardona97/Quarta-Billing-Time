import type { CapStatus } from '@/lib/types'

interface CapInput {
  client_id: string
  client_name: string
  monthly_cap: number
  used_minutes: number
  business_days_remaining: number
  avg_daily_minutes: number
}

export function calculateCapStatus(input: CapInput): CapStatus {
  const percentage = input.monthly_cap > 0
    ? (input.used_minutes / input.monthly_cap) * 100
    : 0

  let projected_exhaustion_date: string | null = null

  if (input.avg_daily_minutes > 0 && input.used_minutes < input.monthly_cap) {
    const remaining = input.monthly_cap - input.used_minutes
    const daysToExhaustion = Math.ceil(remaining / input.avg_daily_minutes)
    const date = new Date()
    date.setDate(date.getDate() + daysToExhaustion)
    projected_exhaustion_date = date.toISOString().split('T')[0]
  }

  return {
    client_id: input.client_id,
    client_name: input.client_name,
    monthly_cap: input.monthly_cap,
    used_minutes: input.used_minutes,
    percentage: Math.round(percentage * 10) / 10,
    projected_exhaustion_date,
  }
}

export type CapAlertLevel = 'normal' | 'warning' | 'critical' | 'exceeded'

export function getCapAlertLevel(percentage: number): CapAlertLevel {
  if (percentage > 100) return 'exceeded'
  if (percentage >= 100) return 'critical'
  if (percentage >= 80) return 'warning'
  return 'normal'
}
