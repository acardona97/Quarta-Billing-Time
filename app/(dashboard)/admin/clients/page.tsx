"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDuration } from "@/lib/utils/duration"
import { startOfMonthBogota } from "@/lib/utils/date"
import { getCapAlertLevel } from "@/lib/utils/cap-calculator"
import { Building2, AlertTriangle, Search } from "lucide-react"

interface AdminClient {
  id: string
  name: string
  billing_type: string
  monthly_hour_cap: number | null
  monthMinutes: number
  billableMinutes: number
  capPercent: number
  alertLevel: string
  matterCount: number
  attorneyCount: number
}

export default function AdminClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<AdminClient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setLoading(true)
    const monthStart = startOfMonthBogota()

    const [{ data: clientsData }, { data: entries }, { data: matters }] = await Promise.all([
      supabase.from("clients").select("*").eq("is_active", true).order("name"),
      supabase.from("time_entries").select("client_id, user_id, duration_minutes, is_billable").gte("entry_date", monthStart),
      supabase.from("matters").select("client_id").eq("is_active", true),
    ])

    const allEntries = entries || []
    const allMatters = matters || []

    setClients(
      (clientsData || []).map((c: any) => {
        const clientEntries = allEntries.filter((e) => e.client_id === c.id)
        const totalMins = clientEntries.reduce((s, e) => s + e.duration_minutes, 0)
        const billMins = clientEntries.filter((e) => e.is_billable).reduce((s, e) => s + e.duration_minutes, 0)
        const cap = c.monthly_hour_cap || 0
        const capPct = cap > 0 ? (totalMins / cap) * 100 : 0
        const uniqueAttorneys = new Set(clientEntries.map((e) => e.user_id))

        return {
          id: c.id,
          name: c.name,
          billing_type: c.billing_type,
          monthly_hour_cap: c.monthly_hour_cap,
          monthMinutes: totalMins,
          billableMinutes: billMins,
          capPercent: capPct,
          alertLevel: cap > 0 ? getCapAlertLevel(capPct) : "normal",
          matterCount: allMatters.filter((m) => m.client_id === c.id).length,
          attorneyCount: uniqueAttorneys.size,
        }
      })
    )
    setLoading(false)
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )
  const alertClients = clients.filter((c) => c.alertLevel !== "normal")

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Todos los Clientes
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {clients.length} activos · {alertClients.length} con alertas de cap
        </p>
      </div>

      {/* Cap alerts */}
      {alertClients.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Alertas de cap</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alertClients.map((c) => (
                <Badge
                  key={c.id}
                  variant={c.alertLevel === "exceeded" || c.alertLevel === "critical" ? "destructive" : "outline"}
                  className="text-xs"
                >
                  {c.name}: {Math.round(c.capPercent)}%
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="pl-9 h-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs w-20">Tipo</TableHead>
              <TableHead className="text-xs w-24">Horas mes</TableHead>
              <TableHead className="text-xs w-24">Facturable</TableHead>
              <TableHead className="text-xs w-32">Cap</TableHead>
              <TableHead className="text-xs w-16 text-center">Asuntos</TableHead>
              <TableHead className="text-xs w-16 text-center">Abog.</TableHead>
              <TableHead className="text-xs w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {c.billing_type === "fee" ? "Paquete" : c.billing_type === "project" ? "Proyecto" : "Por horas"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">{formatDuration(c.monthMinutes)}</TableCell>
                <TableCell className="text-xs font-mono">{formatDuration(c.billableMinutes)}</TableCell>
                <TableCell>
                  {c.monthly_hour_cap ? (
                    <div className="space-y-0.5">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden w-20">
                        <div
                          className={`h-full rounded-full ${
                            c.alertLevel === "exceeded" || c.alertLevel === "critical" ? "bg-red-500" :
                            c.alertLevel === "warning" ? "bg-amber-500" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(c.capPercent, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {Math.round(c.capPercent)}% de {formatDuration(c.monthly_hour_cap)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-center">{c.matterCount}</TableCell>
                <TableCell className="text-xs text-center">{c.attorneyCount}</TableCell>
                <TableCell>
                  {(c.alertLevel === "exceeded" || c.alertLevel === "critical") && (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  {c.alertLevel === "warning" && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
