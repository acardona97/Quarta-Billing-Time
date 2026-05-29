"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
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
import { Shield, Search } from "lucide-react"

interface AuditEvent {
  id: string
  event_type: string
  actor_id: string
  actor_name: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, any> | null
  created_at: string
}

export default function AuditPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    loadAudit()
  }, [])

  async function loadAudit() {
    setLoading(true)
    const { data } = await supabase
      .from("audit_events")
      .select(`
        *,
        actor:users!audit_events_actor_id_fkey(full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(200)

    setEvents(
      (data || []).map((e: any) => ({
        id: e.id,
        event_type: e.event_type,
        actor_id: e.actor_id,
        actor_name: e.actor?.full_name || "Sistema",
        target_type: e.target_type,
        target_id: e.target_id,
        metadata: e.metadata,
        created_at: e.created_at,
      }))
    )
    setLoading(false)
  }

  const filtered = events.filter((e) =>
    e.event_type.toLowerCase().includes(search.toLowerCase()) ||
    e.actor_name.toLowerCase().includes(search.toLowerCase())
  )

  function formatEventType(type: string) {
    const map: Record<string, { label: string; color: string }> = {
      "entry.create": { label: "Entrada creada", color: "bg-green-100 text-green-800" },
      "entry.update": { label: "Entrada editada", color: "bg-blue-100 text-blue-800" },
      "entry.delete": { label: "Entrada eliminada", color: "bg-red-100 text-red-800" },
      "timer.start": { label: "Timer iniciado", color: "bg-emerald-100 text-emerald-800" },
      "timer.stop": { label: "Timer detenido", color: "bg-amber-100 text-amber-800" },
      "client.create": { label: "Cliente creado", color: "bg-purple-100 text-purple-800" },
      "matter.create": { label: "Asunto creado", color: "bg-indigo-100 text-indigo-800" },
      "user.login": { label: "Inicio sesión", color: "bg-gray-100 text-gray-800" },
      "cap.exceeded": { label: "Cap excedido", color: "bg-red-100 text-red-800" },
      "cap.warning": { label: "Cap advertencia", color: "bg-amber-100 text-amber-800" },
    }
    return map[type] || { label: type, color: "bg-gray-100 text-gray-800" }
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Auditoría
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Historial de acciones administrativas
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar evento o actor..."
          className="pl-9 h-9"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs w-36">Fecha</TableHead>
              <TableHead className="text-xs w-36">Evento</TableHead>
              <TableHead className="text-xs">Actor</TableHead>
              <TableHead className="text-xs">Objetivo</TableHead>
              <TableHead className="text-xs">Detalles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Sin eventos de auditoría
                </TableCell>
              </TableRow>
            ) : filtered.map((event) => {
              const { label, color } = formatEventType(event.event_type)
              return (
                <TableRow key={event.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {formatTime(event.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 ${color}`}>
                      {label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{event.actor_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {event.target_type || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                    {event.metadata ? JSON.stringify(event.metadata).slice(0, 80) : "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
