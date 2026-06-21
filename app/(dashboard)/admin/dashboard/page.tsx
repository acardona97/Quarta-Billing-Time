"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/utils/duration"
import { todayBogota, startOfWeekBogota, startOfMonthBogota } from "@/lib/utils/date"
import { getCapAlertLevel } from "@/lib/utils/cap-calculator"
import {
  BarChart3, Clock, Users, Building2, TrendingUp,
  AlertTriangle, DollarSign, Timer, RefreshCw, CheckCircle2,
  Activity, Zap,
} from "lucide-react"

interface RpcRow {
  entry_date: string
  user_id: string
  client_id: string
  matter_id: string
  user_name: string
  client_name: string
  matter_name: string
  billing_type: string
  duration_minutes: number
  is_billable: boolean
  hourly_rate: number | null
  applied_rate: number | null
}

interface AttorneyRow {
  id: string
  name: string
  total: number
  billable: number
}

interface ClientRow {
  id: string
  name: string
  billing_type: string
  minutes: number
  cap: number | null
  alertLevel: string
}

export default function AdminDashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [todayMin, setTodayMin] = useState(0)
  const [weekMin, setWeekMin] = useState(0)
  const [monthMin, setMonthMin] = useState(0)
  const [billableMin, setBillableMin] = useState(0)
  const [nonBillableMin, setNonBillableMin] = useState(0)
  const [totalEntries, setTotalEntries] = useState(0)
  const [activeTimers, setActiveTimers] = useState(0)
  const [attorneys, setAttorneys] = useState<AttorneyRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    const today = todayBogota()
    const weekStart = startOfWeekBogota()
    const monthStart = startOfMonthBogota()

    // Use SECURITY DEFINER RPC — sees ALL attorneys' entries
    const { data: rows, error } = await supabase.rpc("report_time_entries", {
      p_from: monthStart,
      p_to: today,
    })

    const all: RpcRow[] = rows || []

    if (!error) {
      const todayR = all.filter((r) => r.entry_date === today)
      const weekR = all.filter((r) => r.entry_date >= weekStart)
      const billR = all.filter((r) => r.is_billable)
      const nonR = all.filter((r) => !r.is_billable)

      setTodayMin(todayR.reduce((s, r) => s + r.duration_minutes, 0))
      setWeekMin(weekR.reduce((s, r) => s + r.duration_minutes, 0))
      setMonthMin(all.reduce((s, r) => s + r.duration_minutes, 0))
      setBillableMin(billR.reduce((s, r) => s + r.duration_minutes, 0))
      setNonBillableMin(nonR.reduce((s, r) => s + r.duration_minutes, 0))
      setTotalEntries(all.length)

      // Attorney ranking
      const byAtty: Record<string, AttorneyRow> = {}
      for (const r of all) {
        if (!byAtty[r.user_id]) byAtty[r.user_id] = { id: r.user_id, name: r.user_name || "—", total: 0, billable: 0 }
        byAtty[r.user_id].total += r.duration_minutes
        if (r.is_billable) byAtty[r.user_id].billable += r.duration_minutes
      }
      setAttorneys(Object.values(byAtty).sort((a, b) => b.total - a.total))

      // Client consumption (aggregate from entries, then enrich with cap)
      const byClient: Record<string, { name: string; billing_type: string; minutes: number }> = {}
      for (const r of all) {
        if (!byClient[r.client_id]) byClient[r.client_id] = { name: r.client_name || "—", billing_type: r.billing_type || "", minutes: 0 }
        byClient[r.client_id].minutes += r.duration_minutes
      }

      // Fetch caps for all clients visible to admin
      const { data: caps } = await supabase
        .from("clients")
        .select("id, monthly_hour_cap, billing_type")
        .eq("is_active", true)

      const capMap: Record<string, { cap: number | null; billing_type: string }> = {}
      for (const c of caps || []) capMap[c.id] = { cap: c.monthly_hour_cap, billing_type: c.billing_type }

      const clientRows: ClientRow[] = Object.entries(byClient).map(([id, d]) => {
        const cap = capMap[id]?.cap ?? null
        const pct = cap && cap > 0 ? (d.minutes / cap) * 100 : 0
        return {
          id,
          name: d.name,
          billing_type: capMap[id]?.billing_type || d.billing_type,
          minutes: d.minutes,
          cap,
          alertLevel: cap && cap > 0 ? getCapAlertLevel(pct) : "normal",
        }
      }).sort((a, b) => b.minutes - a.minutes)

      setClients(clientRows)
    }

    // Active timers (separate query, not in RPC)
    const { count } = await supabase
      .from("timer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("is_running", true)
    setActiveTimers(count || 0)

    setLastUpdated(new Date())
    setLoading(false)
    setRefreshing(false)
  }, [supabase])

  useEffect(() => {
    load()
    // Auto-refresh every 60s
    const interval = setInterval(() => load(true), 60_000)
    // Listen for new entries from this tab
    const onEntry = () => load(true)
    window.addEventListener("time-entry-created", onEntry)
    return () => {
      clearInterval(interval)
      window.removeEventListener("time-entry-created", onEntry)
    }
  }, [load])

  const billableRatio = monthMin > 0 ? Math.round((billableMin / monthMin) * 100) : 0
  const maxAttyMin = attorneys[0]?.total || 1

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Activity className="h-8 w-8 text-primary animate-pulse mx-auto" />
          <p className="text-sm text-muted-foreground">Cargando panel ejecutivo...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Panel Ejecutivo
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Firma completa · Mes actual ·{" "}
            {lastUpdated && (
              <span className="text-xs">
                actualizado {lastUpdated.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Clock className="h-5 w-5" />}
          label="Hoy"
          value={formatDuration(todayMin)}
          sub="firma completa"
          accent="blue"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Esta semana"
          value={formatDuration(weekMin)}
          sub="acumulado"
          accent="indigo"
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Este mes"
          value={formatDuration(monthMin)}
          sub={`${totalEntries} registros`}
          accent="emerald"
        />
        <KpiCard
          icon={<Zap className="h-5 w-5" />}
          label="Timers activos"
          value={String(activeTimers)}
          sub={activeTimers === 0 ? "ninguno corriendo" : "en tiempo real"}
          accent={activeTimers > 0 ? "amber" : "gray"}
          pulse={activeTimers > 0}
        />
      </div>

      {/* Facturabilidad + Ranking */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut facturabilidad */}
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">Facturabilidad del mes</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
                {/* Track */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="currentColor" strokeWidth="3.5"
                  className="text-white/10"
                />
                {/* Non-billable (red) */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#ef4444" strokeWidth="3.5"
                  strokeDasharray={`${100 - billableRatio}, 100`}
                  strokeDashoffset={`-${billableRatio}`}
                />
                {/* Billable (emerald) */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#10b981" strokeWidth="3.5"
                  strokeDasharray={`${billableRatio}, 100`}
                  style={{ transition: "stroke-dasharray 0.8s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{billableRatio}%</span>
                <span className="text-[10px] text-muted-foreground">facturable</span>
              </div>
            </div>
            <div className="space-y-3 flex-1">
              <LegendRow color="bg-emerald-500" label="Facturable" value={formatDuration(billableMin)} />
              <LegendRow color="bg-red-500" label="No facturable" value={formatDuration(nonBillableMin)} />
              <div className="pt-1 border-t border-white/10">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Total mes</span>
                  <span className="font-mono font-semibold text-foreground">{formatDuration(monthMin)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ranking abogados */}
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold">Ranking productividad</h2>
            <Badge variant="outline" className="text-[10px] ml-auto">{attorneys.length} abogados</Badge>
          </div>
          {attorneys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin registros este mes</p>
          ) : (
            <div className="space-y-3">
              {attorneys.slice(0, 6).map((a, i) => {
                const pct = (a.total / maxAttyMin) * 100
                const billPct = a.total > 0 ? Math.round((a.billable / a.total) * 100) : 0
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null
                return (
                  <div key={a.id} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-center">
                        {medal || `${i + 1}`}
                      </span>
                      <span className="text-xs font-medium flex-1 truncate">{a.name}</span>
                      <span className="text-xs font-mono font-semibold shrink-0">{formatDuration(a.total)}</span>
                      <span className={`text-[10px] shrink-0 w-12 text-right ${billPct >= 70 ? "text-emerald-400" : billPct >= 40 ? "text-amber-400" : "text-red-400"}`}>
                        {billPct}% fact.
                      </span>
                    </div>
                    <div className="ml-7 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Client consumption grid */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold">Consumo por cliente — mes actual</h2>
          <Badge variant="outline" className="text-[10px] ml-auto">{clients.length} clientes</Badge>
        </div>

        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin horas registradas este mes</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((c) => {
              const capPct = c.cap && c.cap > 0 ? Math.min((c.minutes / c.cap) * 100, 100) : null
              const realPct = c.cap && c.cap > 0 ? (c.minutes / c.cap) * 100 : null
              const barColor =
                c.alertLevel === "exceeded" || c.alertLevel === "critical" ? "from-red-500 to-red-600" :
                c.alertLevel === "warning" ? "from-amber-400 to-amber-500" :
                "from-blue-500 to-indigo-500"
              const typeLabel =
                c.billing_type === "fee" ? "Paquete" :
                c.billing_type === "project" ? "Proyecto" : "Por horas"
              const typeColor =
                c.billing_type === "fee" ? "text-blue-400 border-blue-400/30" :
                c.billing_type === "project" ? "text-amber-400 border-amber-400/30" :
                "text-emerald-400 border-emerald-400/30"

              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-white/8 bg-white/4 p-3 hover:bg-white/8 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 mt-0.5 ${typeColor}`}>
                        {typeLabel}
                      </Badge>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold">{formatDuration(c.minutes)}</p>
                      {c.cap && (
                        <p className="text-[10px] text-muted-foreground">/ {formatDuration(c.cap)}</p>
                      )}
                    </div>
                  </div>

                  {capPct !== null && (
                    <>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                          style={{ width: `${capPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-[10px] font-medium ${
                          c.alertLevel === "exceeded" || c.alertLevel === "critical" ? "text-red-400" :
                          c.alertLevel === "warning" ? "text-amber-400" : "text-muted-foreground"
                        }`}>
                          {Math.round(realPct!)}% consumido
                          {(c.alertLevel === "exceeded" || c.alertLevel === "critical") && " ⚠ AGOTADO"}
                          {c.alertLevel === "warning" && " ⚠ Alerta 80%"}
                        </span>
                        {c.alertLevel !== "normal" && (
                          <AlertTriangle className={`h-3 w-3 shrink-0 ${
                            c.alertLevel === "exceeded" || c.alertLevel === "critical" ? "text-red-400" : "text-amber-400"
                          }`} />
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  icon, label, value, sub, accent, pulse,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  accent: "blue" | "indigo" | "emerald" | "amber" | "gray"
  pulse?: boolean
}) {
  const accentClasses: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    gray: "text-muted-foreground bg-white/5 border-white/10",
  }
  return (
    <div className={`rounded-xl border p-4 ${accentClasses[accent]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide font-semibold opacity-70">{label}</span>
        <div className={`relative ${pulse ? "animate-pulse" : ""}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[11px] opacity-60 mt-0.5">{sub}</p>
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`} />
      <span className="flex-1 text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono font-medium">{value}</span>
    </div>
  )
}
