const BOGOTA_TZ = 'America/Bogota'

export function nowBogota(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: BOGOTA_TZ })
  )
}

export function formatDateBogota(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('es-CO', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTimeBogota(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('es-CO', {
    timeZone: BOGOTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function todayBogota(): string {
  return nowBogota().toISOString().split('T')[0]
}

export function isWithinEditWindow(entryDate: string, windowDays: number): boolean {
  const entry = new Date(entryDate)
  const now = nowBogota()
  const diffMs = now.getTime() - entry.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= windowDays
}

export function startOfWeekBogota(weekOffset = 0): string {
  const now = nowBogota()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  now.setDate(now.getDate() - diff + weekOffset * 7)
  return now.toISOString().split('T')[0]
}

export function startOfMonthBogota(): string {
  const now = nowBogota()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function getWeekDates(weekOffset = 0): string[] {
  const start = new Date(startOfWeekBogota(weekOffset))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}
