export const CATEGORIES = [
  { value: 'meeting', label: 'Reunión' },
  { value: 'call', label: 'Llamada' },
  { value: 'drafting', label: 'Redacción' },
  { value: 'review', label: 'Revisión' },
  { value: 'research', label: 'Investigación' },
  { value: 'email', label: 'Correo' },
  { value: 'other', label: 'Otro' },
] as const

export const QUICK_DURATIONS = [
  { minutes: 15, label: '15min' },
  { minutes: 30, label: '30min' },
  { minutes: 60, label: '1h' },
  { minutes: 90, label: '1h 30min' },
  { minutes: 120, label: '2h' },
] as const

export const CAP_WARNING_THRESHOLD = 80
export const CAP_CRITICAL_THRESHOLD = 100

export const DEFAULT_DAILY_GOAL_MINUTES = 360
export const DEFAULT_SELF_EDIT_WINDOW_DAYS = 7
export const DEFAULT_RECONCILIATION_TIME = '17:30'

export const LATE_ENTRY_DAYS = 7

export const TIMER_SYNC_INTERVAL_MS = 30_000
export const TIMER_ROUND_INCREMENT = 15

export const COLORS = {
  primary: '#1E3A8A',
  primaryLight: '#1E40AF',
  accent: '#B45309',
  accentGold: '#d4a84b',
  background: '#F8FAFC',
  foreground: '#0F172A',
  muted: '#E9EEF5',
  border: '#CBD5E1',
  destructive: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
} as const
