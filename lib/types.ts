export type UserRole = 'super_admin' | 'partner_admin' | 'attorney'

export type BillingType = 'fee' | 'hourly' | 'project'

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  fee: "Paquete de horas",
  hourly: "Cobro por horas",
  project: "Tarifa fija",
}

export const BILLING_TYPE_SHORT: Record<BillingType, string> = {
  fee: "Paquete",
  hourly: "Por horas",
  project: "Proyecto",
}

export type EntrySource = 'manual' | 'timer' | 'outlook' | 'teams' | 'reconciliation'

export type EntryCategory =
  | 'meeting'
  | 'call'
  | 'drafting'
  | 'review'
  | 'research'
  | 'email'
  | 'other'

export type BillingStatus = 'draft' | 'reviewed' | 'approved' | 'invoiced'

export type NotificationType =
  | 'capture_suggestion'
  | 'hour_cap_warning'
  | 'hour_cap_reached'
  | 'entry_edited'
  | 'approval_required'
  | 'daily_reconciliation'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  daily_hour_goal: number
  default_billable: boolean
  notification_push: boolean
  notification_email: boolean
  theme: 'light' | 'dark' | 'system'
  self_edit_window_days: number
  reconciliation_time: string
  streak_current: number
  streak_best: number
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  billing_type: BillingType
  monthly_hour_cap: number | null   // cap mensual compartido en minutos (solo fee)
  nit: string | null
  is_firm_client: boolean           // cliente precreado de la firma (cap compartido)
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface ClientContact {
  id: string
  client_id: string
  contact_name: string | null
  contact_email: string | null
  contact_domain: string | null
  is_primary: boolean
  created_at: string
}

export interface ClientBillingProfile {
  id: string
  client_id: string
  default_currency: string
  payment_terms_days: number
  tax_id: string | null
  billing_address: string | null
  billing_email: string | null
  created_at: string
  updated_at: string
}

export interface Matter {
  id: string
  client_id: string
  name: string
  description: string | null
  billing_type: BillingType
  hour_cap: number | null
  fixed_fee: number | null
  allocated_hours: number | null   // horas destinadas a este asunto (todos los tipos)
  hourly_rate: number | null       // valor hora COP (pospago)
  is_default: boolean
  is_active: boolean
  created_at: string
  created_by: string | null
}

export interface MatterRateOverride {
  id: string
  matter_id: string
  hourly_rate: number
  currency: string
  effective_from: string
  effective_to: string | null
  created_by: string | null
  created_at: string
}

export interface ClientDefaultRate {
  id: string
  client_id: string
  hourly_rate: number
  currency: string
  effective_from: string
  effective_to: string | null
  created_by: string | null
  created_at: string
}

export interface UserClientAssignment {
  id: string
  user_id: string
  client_id: string
  is_active: boolean
  created_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  client_id: string
  matter_id: string
  entry_date: string
  duration_minutes: number
  description: string | null
  category: EntryCategory | null
  is_billable: boolean
  source: EntrySource
  applied_rate: number | null
  billing_status: BillingStatus
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface TimeEntryEditHistory {
  id: string
  time_entry_id: string
  edited_by: string | null
  field_changed: string
  old_value: string | null
  new_value: string | null
  edit_reason: string | null
  created_at: string
}

export interface TimerSession {
  id: string
  user_id: string
  client_id: string | null
  matter_id: string | null
  started_at: string
  description: string | null
  category: EntryCategory | null
  is_running: boolean
  paused_at: string | null
  accumulated_seconds: number
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  payload: Record<string, unknown> | null
  priority: NotificationPriority
  status: 'unread' | 'read' | 'actioned' | 'dismissed'
  created_at: string
  read_at: string | null
  actioned_at: string | null
}

export interface AuditEvent {
  id: string
  performed_by: string | null
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'export'
  entity_type: string
  entity_id: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface TimeEntryWithRelations extends TimeEntry {
  client?: Client
  matter?: Matter
  user?: User
}

export interface TimerSessionWithRelations extends TimerSession {
  client?: Client
  matter?: Matter
}

export interface ClientWithMatters extends Client {
  matters?: Matter[]
}

export interface DashboardStats {
  today_minutes: number
  week_minutes: number
  month_minutes: number
  daily_goal: number
  billable_ratio: number
  streak_current: number
  streak_best: number
}

export interface CapStatus {
  client_id: string
  client_name: string
  monthly_cap: number
  used_minutes: number
  percentage: number
  projected_exhaustion_date: string | null
}
