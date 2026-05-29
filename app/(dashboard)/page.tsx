import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DashboardContent } from "@/components/dashboard/dashboard-content"
import { todayBogota, startOfWeekBogota, startOfMonthBogota } from "@/lib/utils/date"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  const { data: preferences } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", profile.id)
    .single()

  const today = todayBogota()
  const weekStart = startOfWeekBogota()
  const monthStart = startOfMonthBogota()

  const [todayEntries, weekEntries, monthEntries, recentEntries, activeTimers] = await Promise.all([
    supabase
      .from("time_entries")
      .select("duration_minutes, is_billable")
      .eq("user_id", profile.id)
      .eq("entry_date", today),
    supabase
      .from("time_entries")
      .select("duration_minutes, is_billable")
      .eq("user_id", profile.id)
      .gte("entry_date", weekStart),
    supabase
      .from("time_entries")
      .select("duration_minutes, is_billable")
      .eq("user_id", profile.id)
      .gte("entry_date", monthStart),
    supabase
      .from("time_entries")
      .select("*, clients(name), matters(name)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("timer_sessions")
      .select("*, clients(name), matters(name)")
      .eq("user_id", profile.id)
      .eq("is_running", true),
  ])

  const todayMinutes = (todayEntries.data || []).reduce((sum, e) => sum + e.duration_minutes, 0)
  const weekMinutes = (weekEntries.data || []).reduce((sum, e) => sum + e.duration_minutes, 0)
  const monthMinutes = (monthEntries.data || []).reduce((sum, e) => sum + e.duration_minutes, 0)

  const monthBillable = (monthEntries.data || [])
    .filter((e) => e.is_billable)
    .reduce((sum, e) => sum + e.duration_minutes, 0)
  const billableRatio = monthMinutes > 0 ? (monthBillable / monthMinutes) * 100 : 0

  const stats = {
    today_minutes: todayMinutes,
    week_minutes: weekMinutes,
    month_minutes: monthMinutes,
    daily_goal: preferences?.daily_hour_goal || 360,
    billable_ratio: Math.round(billableRatio),
    streak_current: preferences?.streak_current || 0,
    streak_best: preferences?.streak_best || 0,
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Resumen de tu actividad de hoy
        </p>
      </div>

      <DashboardContent
        stats={stats}
        recentEntries={recentEntries.data || []}
        activeTimers={activeTimers.data || []}
      />
    </div>
  )
}
