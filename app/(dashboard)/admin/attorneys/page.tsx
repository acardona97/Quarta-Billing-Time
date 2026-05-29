"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/utils/duration"
import { todayBogota, startOfWeekBogota, startOfMonthBogota } from "@/lib/utils/date"
import {
  Users, Clock, TrendingUp, Flame, Timer,
  ChevronDown, ChevronUp, Building2, FolderOpen,
  Hourglass, DollarSign,
} from "lucide-react"
import type { Client, Matter, BillingType } from "@/lib/types"
import { BILLING_TYPE_SHORT } from "@/lib/types"

interface AttorneyDetail {
  id: string
  full_name: string
  email: string
  role: string
  todayMinutes: number
  weekMinutes: number
  monthMinutes: number
  billablePercent: number
  entryCount: number
  activeTimers: number
  streakDays: number
}

interface AttorneyClient extends Client {
  matters: Matter[]
  totalMinutes: number      // ALL attorneys combined
  attorneyMinutes: number   // THIS attorney only
}

export default function AttorneysPage() {
  const supabase = createClient()
  const [attorneys, setAttorneys] = useState<AttorneyDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [attorneyClients, setAttorneyClients] = useState<AttorneyClient[]>([])
  const [loadingClients, setLoadingClients] = useState(false)

  useEffect(() => {
    loadAttorneys()
  }, [])

  async function loadAttorneys() {
    setLoading(true)
    const today = todayBogota()
    const weekStart = startOfWeekBogota()
    const monthStart = startOfMonthBogota()

    const { data: profiles } = await supabase
      .from("users")
      .select("id, full_name, email, role")
      .in("role", ["attorney", "partner_admin", "super_admin"])
      .order("full_name")

    const { data: entries } = await supabase
      .from("time_entries")
      .select("user_id, entry_date, duration_minutes, is_billable")
      .gte("entry_date", monthStart)

    const { data: timers } = await supabase
      .from("timer_sessions")
      .select("user_id")
      .eq("is_running", true)

    const allEntries = entries || []
    const allTimers = timers || []

    setAttorneys(
      (profiles || []).map((p: any) => {
        const userEntries = allEntries.filter((e) => e.user_id === p.id)
        const todayE = userEntries.filter((e) => e.entry_date === today)
        const weekE = userEntries.filter((e) => e.entry_date >= weekStart)
        const billable = userEntries.filter((e) => e.is_billable)
        const totalMins = userEntries.reduce((s, e) => s + e.duration_minutes, 0)

        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          role: p.role,
          todayMinutes: todayE.reduce((s, e) => s + e.duration_minutes, 0),
          weekMinutes: weekE.reduce((s, e) => s + e.duration_minutes, 0),
          monthMinutes: totalMins,
          billablePercent: totalMins > 0 ? Math.round((billable.reduce((s, e) => s + e.duration_minutes, 0) / totalMins) * 100) : 0,
          entryCount: userEntries.length,
          activeTimers: allTimers.filter((t) => t.user_id === p.id).length,
          streakDays: 0,
        }
      })
    )
    setLoading(false)
  }

  async function loadAttorneyClients(attorneyId: string) {
    setLoadingClients(true)

    // Get this attorney's assigned clients
    const { data: assignments } = await supabase
      .from("user_client_assignments")
      .select("client_id")
      .eq("user_id", attorneyId)
      .eq("is_active", true)

    const clientIds = (assignments || []).map((a) => a.client_id)

    if (clientIds.length === 0) {
      setAttorneyClients([])
      setLoadingClients(false)
      return
    }

    const { data: clientsData } = await supabase
      .from("clients")
      .select("*, matters(*)")
      .in("id", clientIds)
      .eq("is_active", true)
      .order("name")

    if (clientsData) {
      const monthStart = startOfMonthBogota()
      // Get ALL entries for these clients — admin sees total + per-attorney breakdown
      const { data: hours } = await supabase
        .from("time_entries")
        .select("client_id, user_id, duration_minutes")
        .in("client_id", clientIds)
        .gte("entry_date", monthStart)

      const hoursByClient = (hours || []).reduce((acc, h) => {
        acc[h.client_id] = (acc[h.client_id] || 0) + h.duration_minutes
        return acc
      }, {} as Record<string, number>)

      // This attorney's hours only
      const attorneyHoursByClient = (hours || [])
        .filter((h) => h.user_id === attorneyId)
        .reduce((acc, h) => {
          acc[h.client_id] = (acc[h.client_id] || 0) + h.duration_minutes
          return acc
        }, {} as Record<string, number>)

      setAttorneyClients(
        clientsData.map((c: any) => ({
          ...c,
          matters: c.matters || [],
          totalMinutes: hoursByClient[c.id] || 0,
          attorneyMinutes: attorneyHoursByClient[c.id] || 0,
        }))
      )
    }

    setLoadingClients(false)
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setAttorneyClients([])
    } else {
      setExpandedId(id)
      loadAttorneyClients(id)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Equipo
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {attorneys.length} abogados · productividad mes actual ·{" "}
          <span className="text-foreground/70">click para ver clientes</span>
        </p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : (
        <div className="space-y-4">
          {attorneys.map((a) => (
            <div key={a.id}>
              {/* Attorney card — clickable */}
              <Card
                className={`cursor-pointer transition-all ${
                  expandedId === a.id
                    ? "ring-2 ring-primary/30 shadow-md"
                    : "hover:shadow-md"
                }`}
                onClick={() => toggleExpand(a.id)}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-sm">{a.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">{a.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {a.activeTimers > 0 && (
                        <Badge variant="default" className="text-[9px] px-1.5 py-0 animate-pulse">
                          <Timer className="h-2.5 w-2.5 mr-0.5" />
                          {a.activeTimers}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {a.role === "super_admin" ? "Super Admin" :
                         a.role === "partner_admin" ? "Partner" : "Abogado"}
                      </Badge>
                      {expandedId === a.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Hoy</p>
                      <p className="text-sm font-mono font-semibold">{formatDuration(a.todayMinutes)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Semana</p>
                      <p className="text-sm font-mono font-semibold">{formatDuration(a.weekMinutes)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Mes</p>
                      <p className="text-sm font-mono font-semibold">{formatDuration(a.monthMinutes)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Fact.</p>
                      <p className="text-sm font-mono font-semibold">{a.billablePercent}%</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all"
                      style={{ width: `${Math.min((a.monthMinutes / (360 * 22)) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {a.entryCount} entradas este mes
                  </p>
                </CardContent>
              </Card>

              {/* Expanded: attorney's clients dashboard (read-only) */}
              {expandedId === a.id && (
                <div className="mt-2 ml-4 border-l-2 border-primary/20 pl-4 pb-2 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 pt-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">
                      Clientes de {a.full_name.split(" ")[0]}
                    </p>
                  </div>

                  {loadingClients ? (
                    <p className="text-xs text-muted-foreground py-4">Cargando clientes...</p>
                  ) : attorneyClients.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4">
                      Sin clientes asignados
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {attorneyClients.map((client) => (
                        <AttorneyClientCard
                          key={client.id}
                          client={client}
                          attorneyName={a.full_name.split(" ")[0]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── READ-ONLY CLIENT CARD (for admin view of attorney's clients) ────

function AttorneyClientCard({
  client,
  attorneyName,
}: {
  client: AttorneyClient
  attorneyName: string
}) {
  const isFeeClient = client.billing_type === "fee"
  const capMinutes = client.monthly_hour_cap || 0
  const capPercent = capMinutes > 0 ? Math.min((client.totalMinutes / capMinutes) * 100, 100) : 0
  const totalAllocated = client.matters.reduce((sum, m) => sum + (m.allocated_hours || 0), 0)
  const hasOtherAttorneys = client.totalMinutes !== client.attorneyMinutes

  return (
    <Card className="bg-muted/30">
      <CardContent className="py-3 px-4 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold">{client.name}</p>
          </div>
          <Badge variant={isFeeClient ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">
            {isFeeClient ? "Paquete" : "Por horas"}
          </Badge>
        </div>

        {/* Hours breakdown: this attorney + total */}
        <div className="space-y-0.5 text-[10px]">
          <div className="flex items-center gap-1.5 text-foreground font-medium">
            <Clock className="h-2.5 w-2.5 text-primary" />
            {attorneyName}: {formatDuration(client.attorneyMinutes)}
          </div>
          {hasOtherAttorneys && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-2.5 w-2.5" />
              Total equipo: {formatDuration(client.totalMinutes)}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FolderOpen className="h-2.5 w-2.5" />
            {client.matters.length} asuntos
          </div>
        </div>

        {/* Cap progress — fee clients */}
        {isFeeClient && capMinutes > 0 && (
          <div className="space-y-1 p-1.5 rounded bg-background/60">
            <div className="flex justify-between text-[9px]">
              <span className="text-muted-foreground">Cap</span>
              <span className="font-semibold">
                {formatDuration(client.totalMinutes)} / {formatDuration(capMinutes)}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capPercent >= 100 ? "bg-red-500" :
                  capPercent >= 80 ? "bg-amber-500" :
                  "bg-green-500"
                }`}
                style={{ width: `${capPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>{Math.round(capPercent)}% consumido</span>
              {totalAllocated > 0 && (
                <span>{totalAllocated}h asignadas de {Math.round(capMinutes / 60)}h</span>
              )}
            </div>
          </div>
        )}

        {/* Matters list */}
        <div className="space-y-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Asuntos
          </p>
          {client.matters.map((m) => {
            const bt = m.billing_type || client.billing_type || "hourly"
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-1.5 py-0.5 px-1.5 rounded bg-muted/40 text-[10px]"
              >
                <span className="font-medium truncate">{m.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {m.allocated_hours != null && m.allocated_hours > 0 && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 gap-0.5">
                      <Hourglass className="h-2 w-2" />
                      {m.allocated_hours}h
                    </Badge>
                  )}
                  {bt === "hourly" && m.hourly_rate != null && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 gap-0.5">
                      <DollarSign className="h-2 w-2" />
                      ${new Intl.NumberFormat("es-CO").format(m.hourly_rate)}/h
                    </Badge>
                  )}
                  <Badge
                    variant={bt === "fee" ? "default" : bt === "project" ? "outline" : "secondary"}
                    className="text-[8px] px-1 py-0"
                  >
                    {BILLING_TYPE_SHORT[bt as BillingType] || "Por horas"}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
