"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/utils/duration"
import { todayBogota } from "@/lib/utils/date"
import { DEFAULT_DAILY_GOAL_MINUTES } from "@/lib/constants"
import { Bell, Clock, AlertTriangle, CheckCircle2, Timer } from "lucide-react"

interface Notification {
  id: string
  type: "reconciliation" | "cap_warning" | "cap_exceeded" | "timer_forgotten" | "streak"
  title: string
  message: string
  created_at: string
  read: boolean
}

export default function NotificationsPage() {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [todayMinutes, setTodayMinutes] = useState(0)
  const [activeTimers, setActiveTimers] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = todayBogota()

    // Today's hours
    const { data: entries } = await supabase
      .from("time_entries")
      .select("duration_minutes")
      .eq("user_id", user.id)
      .eq("entry_date", today)

    setTodayMinutes((entries || []).reduce((s, e) => s + e.duration_minutes, 0))

    // Active timers
    const { count } = await supabase
      .from("timer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_running", true)

    setActiveTimers(count || 0)

    // Generate in-app notifications based on state
    const notifs: Notification[] = []
    const gap = DEFAULT_DAILY_GOAL_MINUTES - (entries || []).reduce((s, e) => s + e.duration_minutes, 0)

    if (gap > 0) {
      notifs.push({
        id: "recon-today",
        type: "reconciliation",
        title: "Reconciliación diaria",
        message: `Te faltan ${formatDuration(gap)} para completar tu meta de hoy (${formatDuration(DEFAULT_DAILY_GOAL_MINUTES)})`,
        created_at: new Date().toISOString(),
        read: false,
      })
    }

    if ((count || 0) > 0) {
      notifs.push({
        id: "timer-active",
        type: "timer_forgotten",
        title: "Cronómetros activos",
        message: `Tienes ${count} cronómetro${(count || 0) > 1 ? 's' : ''} corriendo. ¿Los olvidaste?`,
        created_at: new Date().toISOString(),
        read: false,
      })
    }

    // Load cap notifications from DB
    const { data: capNotifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (capNotifs) {
      capNotifs.forEach((n: any) => {
        notifs.push({
          id: n.id,
          type: n.type || "cap_warning",
          title: n.title,
          message: n.message,
          created_at: n.created_at,
          read: n.read_at !== null,
        })
      })
    }

    setNotifications(notifs)
    setLoading(false)
  }

  function getIcon(type: Notification["type"]) {
    switch (type) {
      case "reconciliation": return <Clock className="h-4 w-4 text-blue-500" />
      case "cap_warning": return <AlertTriangle className="h-4 w-4 text-amber-500" />
      case "cap_exceeded": return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "timer_forgotten": return <Timer className="h-4 w-4 text-green-500" />
      case "streak": return <CheckCircle2 className="h-4 w-4 text-purple-500" />
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Notificaciones
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Alertas y recordatorios
        </p>
      </div>

      {/* Daily summary card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Resumen de hoy</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDuration(todayMinutes)} registradas de {formatDuration(DEFAULT_DAILY_GOAL_MINUTES)} meta
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold font-mono">
                {Math.round((todayMinutes / DEFAULT_DAILY_GOAL_MINUTES) * 100)}%
              </p>
              {activeTimers > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {activeTimers} timer{activeTimers > 1 ? "s" : ""} activo{activeTimers > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min((todayMinutes / DEFAULT_DAILY_GOAL_MINUTES) * 100, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications list */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin notificaciones pendientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              className={notif.read ? "opacity-60" : ""}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                  </div>
                  {notif.read && (
                    <Badge variant="outline" className="text-[9px] shrink-0">Leída</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
