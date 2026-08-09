const BOGOTA_TZ = 'America/Bogota'

// en-CA locale formats as YYYY-MM-DD directly — one Intl call, no Date-object
// timezone guessing. Single source of truth for "what date is it in Bogota
// right now", correct whether this code runs in a UTC server or a browser
// set to any timezone (the old toLocaleString→new Date→toISOString chain
// depended on the runtime's system timezone and broke near midnight UTC).
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ })
const timeFmt = new Intl.DateTimeFormat('es-CO', {
  timeZone: BOGOTA_TZ, hour: '2-digit', minute: '2-digit',
})

export function nowBogota(): Date {
  // Real instant — safe for relative "how long ago" math, NOT for reading
  // calendar date (getDate/getDay are system-timezone-dependent). Use
  // todayBogota() for the calendar date.
  return new Date()
}

export function formatDateBogota(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00Z') : date
  return d.toLocaleDateString('es-CO', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTimeBogota(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return timeFmt.format(d)
}

// Bogota calendar date as YYYY-MM-DD — never shifts across midnight due to
// server/browser timezone mismatch.
export function todayBogota(): string {
  return dateFmt.format(new Date())
}

// Days since epoch for a YYYY-MM-DD string, computed with UTC methods only —
// date-only values must never touch local-timezone Date methods.
function daysSinceEpoch(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function isWithinEditWindow(entryDate: string, windowDays: number): boolean {
  const diffDays = daysSinceEpoch(todayBogota()) - daysSinceEpoch(entryDate)
  return diffDays <= windowDays
}

// Monday of the week containing today (or offset weeks away), as YYYY-MM-DD.
// All arithmetic in UTC-anchored date-only space — immune to system timezone.
export function startOfWeekBogota(weekOffset = 0): string {
  const [y, m, d] = todayBogota().split('-').map(Number)
  const utcDate = new Date(Date.UTC(y, m - 1, d))
  const dow = utcDate.getUTCDay() // 0=Sun..6=Sat, matches the UTC-anchored date
  const diffToMonday = dow === 0 ? 6 : dow - 1
  utcDate.setUTCDate(utcDate.getUTCDate() - diffToMonday + weekOffset * 7)
  return utcDate.toISOString().split('T')[0]
}

export function startOfMonthBogota(): string {
  const [y, m] = todayBogota().split('-')
  return `${y}-${m}-01`
}

export function getWeekDates(weekOffset = 0): string[] {
  const [y, m, d] = startOfWeekBogota(weekOffset).split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(start)
    dt.setUTCDate(dt.getUTCDate() + i)
    return dt.toISOString().split('T')[0]
  })
}
