"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDuration } from "@/lib/utils/duration"
import { todayBogota, startOfWeekBogota, startOfMonthBogota } from "@/lib/utils/date"
import { calculateCapStatus, getCapAlertLevel } from "@/lib/utils/cap-calculator"
import {
  BarChart3,
  Clock,
  Users,
  Building2,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Timer,
} from "lucide-react"

interface FirmStats {
  todayMinutes: number
  weekMinutes: number
  monthMinutes: number
  billableMinutes: number
  nonBillableMinutes: number
  totalEntries: number
  activeTimers: number
}

interface AttorneyRanking {
  id: string
  full_name: string
  monthMinutes: number
  billablePercent: number
}

interface ClientConsumption {
  id: string
  name: string
  billing_type: string
  monthMinutes: number
  monthly_hour_cap: number | null
  capPercent: number
  alertLevel: string
}

export default function AdminDashboardPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<FirmStats>({
    todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
    billableMinutes: 0, nonBillableMinutes: 0, totalEntries: 0, activeTimers: 0,
  })
  const [attorneys, setAttorneys] = useState<AttorneyRanking[]>([])
  const [clients, setClients] = useState<ClientConsumption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    const today = todayBogota()
    const weekStart = startOfWeekBogota()
    const monthStart = startOfMonthBogota()

    // All time entries this month
    const { data: entries } = await supabase
      .from("time_entries")
      .select("*, user:users(id, full_name)")
      .gte("entry_date", monthStart)

    const allEntries = entries || []

    // Stats
    const todayEntries = allEntries.filter((e) => e.entry_date === today)
    const weekEntries = allEntries.filter((e) => e.entry_date >= weekStart)
    const billable = allEntries.filter((e) => e.is_billable)
    const nonBillable = allEntries.filter((e) => !e.is_billable)

    // Active timers
    const { count: timerCount } = await supabase
      .from("timer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("is_running", true)

    setStats({
      todayMinutes: todayEntries.reduce((s, e) => s + e.duration_minutes, 0),
      weekMinutes: weekEntries.reduce((s, e) => s + e.duration_minutes, 0),
      monthMinutes: allEntries.reduce((s, e) => s + e.duration_minutes, 0),
      billableMinutes: billable.reduce((s, e) => s + e.duration_minutes, 0),
      nonBillableMinutes: nonBillable.reduce((s, e) => s + e.duration_minutes, 0),
      totalEntries: allEntries.length,
      activeTimers: timerCount || 0,
    })

    // Attorney ranking
    const byAttorney: Record<string, { name: string; total: number; billable: number }> = {}
    allEntries.forEach((e) => {
      const uid = e.user_id
      const name = (e.user as any)?.full_name || "Desconocido"
      if (!byAttorney[uid]) byAttorney[uid] = { name, total: 0, billable: 0 }
      byAttorney[uid].total += e.duration_minutes
      if (e.is_billable) byAttorney[uid].billable += e.duration_minutes
    })

    setAttorneys(
      Object.entries(byAttorney)
        .map(([id, a]) => ({
          id,
          full_name: a.name,
          monthMinutes: a.total,
          billablePercent: a.total > 0 ? Math.round((a.billable / a.total) * 100) : 0,
        }))
        .sort((a, b) => b.monthMinutes - a.monthMinutes)
    )

    // Client consumption
    const { data: clientsData } = await supabase
      .from("clients")
      .select("id, name, billing_type, monthly_hour_cap")
      .eq("is_active", true)

    const byClient: Record<string, number> = {}
    allEntries.forEach((e) => {
      byClient[e.client_id] = (byClient[e.client_id] || 0) + e.duration_minutes
    })

    setClients(
      (clientsData || [])
        .map((c: any) => {
          const mins = byClient[c.id] || 0
          const cap = c.monthly_hour_cap || 0
          const capPercent = cap > 0 ? (mins / cap) * 100 : 0
          return {
            id: c.id,
            name: c.name,
            billing_type: c.billing_type,
            monthMinutes: mins,
            monthly_hour_cap: c.monthly_hour_cap,
            capPercent,
            alertLevel: cap > 0 ? getCapAlertLevel(capPercent) : "normal",
          }
        })
        .sort((a: any, b: any) => b.monthMinutes - a.monthMinutes)
    )

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <p className="text-center text-muted-foreground py-12">Cargando panel ejecutivo...</p>
      </div>
    )
  }

  const billableRatio = stats.monthMinutes > 0
    ? Math.round((stats.billableMinutes / stats.monthMinutes) * 100)
    : 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Panel Ejecutivo
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Vista general de la firma — mes actual
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Hoy"
          value={formatDuration(stats.todayMinutes)}
          sub="firma completa"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Semana"
          value={formatDuration(stats.weekMinutes)}
          sub="acumulado"
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Mes"
          value={formatDuration(stats.monthMinutes)}
          sub={`${billableRatio}% facturable`}
        />
        <StatCard
          icon={<Timer className="h-4 w-4" />}
          label="Timers activos"
          value={String(stats.activeTimers)}
          sub="en este momento"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Billable donut placeholder */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Facturabilidad mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {/* Simple visual donut */}
              <div className="relative h-24 w-24">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${billableRatio}, 100`}
                    className="text-green-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{billableRatio}%</span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span>Facturable: {formatDuration(stats.billableMinutes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                  <span>No facturable: {formatDuration(stats.nonBillableMinutes)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attorney ranking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Ranking productividad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {attorneys.slice(0, 6).map((a, i) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{a.full_name}</p>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${attorneys[0]?.monthMinutes ? (a.monthMinutes / attorneys[0].monthMinutes) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-medium">{formatDuration(a.monthMinutes)}</p>
                    <p className="text-[10px] text-muted-foreground">{a.billablePercent}% fact.</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client consumption */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Consumo por cliente (mes)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                      {c.billing_type === "fee" ? "Paquete" : c.billing_type === "project" ? "Proyecto" : "Por horas"}
                    </Badge>
                    {c.alertLevel === "warning" && (
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    {(c.alertLevel === "critical" || c.alertLevel === "exceeded") && (
                      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                  </div>
                  {c.monthly_hour_cap && (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full ${
                          c.alertLevel === "exceeded" || c.alertLevel === "critical" ? "bg-red-500" :
                          c.alertLevel === "warning" ? "bg-amber-500" :
                          "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(c.capPercent, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono font-medium">{formatDuration(c.monthMinutes)}</p>
                  {c.monthly_hour_cap && (
                    <p className="text-[10px] text-muted-foreground">
                      / {formatDuration(c.monthly_hour_cap)} ({Math.round(c.capPercent)}%)
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-[11px] uppercase tracking-wide font-medium">{label}</span>
        </div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}
