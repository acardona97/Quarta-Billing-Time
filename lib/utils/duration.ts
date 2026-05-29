/**
 * Converts minutes to human-readable Spanish format.
 * 90 → "1h 30min"
 * 45 → "45min"
 * 120 → "2h"
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

/**
 * Parses a duration string back to minutes.
 * "1h 30min" → 90
 * "2h" → 120
 * "45min" → 45
 * "1.5" → 90 (decimal hours)
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase()

  const hm = trimmed.match(/^(\d+)h\s*(\d+)\s*min?$/)
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2])

  const hOnly = trimmed.match(/^(\d+)\s*h$/)
  if (hOnly) return parseInt(hOnly[1]) * 60

  const mOnly = trimmed.match(/^(\d+)\s*min?$/)
  if (mOnly) return parseInt(mOnly[1])

  const decimal = parseFloat(trimmed)
  if (!isNaN(decimal) && decimal > 0) {
    return Math.round(decimal * 60)
  }

  return null
}

/**
 * Rounds minutes to nearest increment (default 15min).
 */
export function roundToNearest(minutes: number, increment = 15): number {
  return Math.round(minutes / increment) * increment
}

/**
 * Converts seconds to minutes, rounded to nearest increment.
 */
export function secondsToRoundedMinutes(seconds: number, increment = 15): number {
  const rawMinutes = seconds / 60
  return roundToNearest(Math.ceil(rawMinutes), increment)
}

/**
 * BILLING ROUNDING ("Taxímetro")
 *
 * Regla de facturación legal por fracción de hora:
 *   0–15 min  →  15 min
 *  15–30 min  →  30 min
 *  30–60 min  →  60 min
 *
 * Patrón se repite para cada hora adicional:
 *  60–75 min  →  75 min (1h 15min)
 *  75–90 min  →  90 min (1h 30min)
 *  90–120 min → 120 min (2h)
 *
 * @param realMinutes - Duración real en minutos (puede ser decimal desde timer)
 * @returns Minutos facturables redondeados según regla
 */
export function roundToBillingIncrement(realMinutes: number): number {
  if (realMinutes <= 0) return 0

  const fullHours = Math.floor(realMinutes / 60)
  const fraction = realMinutes - fullHours * 60

  let roundedFraction: number

  if (fraction === 0 && fullHours > 0) {
    // Exactamente N horas, no redondear
    roundedFraction = 0
  } else if (fraction <= 15) {
    roundedFraction = 15
  } else if (fraction <= 30) {
    roundedFraction = 30
  } else {
    // >30 min en la fracción → se cobra la hora completa
    roundedFraction = 60
  }

  return fullHours * 60 + roundedFraction
}

/**
 * Converts seconds (from timer) to billing-rounded minutes.
 * Timer shows real time; this calculates what to bill.
 */
export function secondsToBillingMinutes(seconds: number): number {
  const rawMinutes = seconds / 60
  return roundToBillingIncrement(rawMinutes)
}
