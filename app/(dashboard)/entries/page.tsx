"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDuration, roundToBillingIncrement } from "@/lib/utils/duration"
import { formatDateBogota, isWithinEditWindow, todayBogota } from "@/lib/utils/date"
import { CATEGORIES } from "@/lib/constants"
import { toast } from "sonner"
import { Pencil, Check, X, Filter, Calendar, Clock, AlertTriangle, Download, FileSpreadsheet, Users } from "lucide-react"
import type { TimeEntryWithRelations } from "@/lib/types"
import * as XLSX from "xlsx"

export default function EntriesPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<TimeEntryWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{
    duration_minutes: number
    description: string
    category: string | null
    is_billable: boolean
  } | null>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [filterClient, setFilterClient] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterSource, setFilterSource] = useState<string>("all")
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    loadEntries()
    loadClients()
  }, [dateFrom, dateTo, filterClient, filterCategory, filterSource])

  // Reload when new entry created from Quick Entry modal
  useEffect(() => {
    window.addEventListener("time-entry-created", loadEntries)
    return () => window.removeEventListener("time-entry-created", loadEntries)
  }, [])

  async function loadClients() {
    // Only show MY assigned clients in filter dropdown
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    const { data: assignments } = await supabase
      .from("user_client_assignments")
      .select("client_id")
      .eq("user_id", authUser.id)
      .eq("is_active", true)

    const myIds = (assignments || []).map((a) => a.client_id)
    if (myIds.length === 0) { setClients([]); return }

    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", myIds)
      .eq("is_active", true)
      .order("name")
    if (data) setClients(data)
  }

  async function loadEntries() {
    setLoading(true)

    // Always filter by current user — attorneys see only their own entries
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setLoading(false); return }

    let query = supabase
      .from("time_entries")
      .select(`
        *,
        client:clients(id, name),
        matter:matters(id, name)
      `)
      .eq("user_id", authUser.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)

    if (dateFrom) query = query.gte("entry_date", dateFrom)
    if (dateTo) query = query.lte("entry_date", dateTo)
    if (filterClient && filterClient !== "all") query = query.eq("client_id", filterClient)
    if (filterCategory && filterCategory !== "all") query = query.eq("category", filterCategory)
    if (filterSource && filterSource !== "all") query = query.eq("source", filterSource)

    const { data, error } = await query

    if (error) {
      toast.error("Error cargando entradas")
    } else {
      setEntries((data as unknown as TimeEntryWithRelations[]) || [])
    }
    setLoading(false)
  }

  function startEdit(entry: TimeEntryWithRelations) {
    if (!isWithinEditWindow(entry.entry_date, 7)) {
      toast.error("Fuera de ventana de edición (7 días)")
      return
    }
    setEditingId(entry.id)
    setEditValues({
      duration_minutes: entry.duration_minutes,
      description: entry.description || "",
      category: entry.category,
      is_billable: entry.is_billable,
    })
  }

  async function saveEdit(entryId: string) {
    if (!editValues) return

    const { error } = await supabase
      .from("time_entries")
      .update({
        duration_minutes: editValues.duration_minutes,
        description: editValues.description || null,
        category: editValues.category,
        is_billable: editValues.is_billable,
      })
      .eq("id", entryId)

    if (error) {
      toast.error("Error guardando cambios")
    } else {
      toast.success("Entrada actualizada")
      loadEntries()
    }
    setEditingId(null)
    setEditValues(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValues(null)
  }

  // Excel export
  function exportToExcel() {
    if (entries.length === 0) {
      toast.error("Sin datos para exportar")
      return
    }

    const rows = entries.map((e) => ({
      Fecha: e.entry_date,
      Cliente: (e.client as any)?.name || "",
      Asunto: (e.matter as any)?.name || "",
      "Duracion (min)": e.duration_minutes,
      Duracion: formatDuration(e.duration_minutes),
      Descripcion: e.description || "",
      Categoria: CATEGORIES.find((c) => c.value === e.category)?.label || e.category || "",
      Facturable: e.is_billable ? "Si" : "No",
      Fuente: e.source,
      "Tarifa (COP)": e.applied_rate || "",
    }))

    const ws = XLSX.utils.json_to_sheet(rows)

    // Column widths
    ws["!cols"] = [
      { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 14 },
      { wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 14 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Mis Entradas")
    XLSX.writeFile(wb, `mis-entradas_${todayBogota()}.xlsx`)
    toast.success("Excel descargado")
  }

  // Stats
  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0)
  const billableMinutes = entries.reduce((sum, e) => sum + (e.is_billable ? e.duration_minutes : 0), 0)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Mis Entradas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {entries.length} entradas · {formatDuration(totalMinutes)} total · {formatDuration(billableMinutes)} facturables
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer gap-2"
          onClick={exportToExcel}
          disabled={entries.length === 0}
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border">
        <Filter className="h-4 w-4 text-muted-foreground" />

        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-36 text-xs"
            placeholder="Desde"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-36 text-xs"
          />
        </div>

        <Select value={filterClient} onValueChange={(v) => setFilterClient(v ?? "all")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSource} onValueChange={(v) => setFilterSource(v ?? "all")}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Fuente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="timer">Cronómetro</SelectItem>
            <SelectItem value="outlook">Outlook</SelectItem>
            <SelectItem value="teams">Teams</SelectItem>
          </SelectContent>
        </Select>

        {(dateFrom || dateTo || filterClient !== "all" || filterCategory !== "all" || filterSource !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs cursor-pointer"
            onClick={() => {
              setDateFrom("")
              setDateTo("")
              setFilterClient("all")
              setFilterCategory("all")
              setFilterSource("all")
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-24 text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Asunto</TableHead>
              <TableHead className="w-20 text-xs">Duración</TableHead>
              <TableHead className="text-xs">Descripción</TableHead>
              <TableHead className="w-24 text-xs">Categoría</TableHead>
              <TableHead className="w-16 text-xs text-center">Fact.</TableHead>
              <TableHead className="w-20 text-xs">Fuente</TableHead>
              <TableHead className="w-16 text-xs"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Sin entradas
                </TableCell>
              </TableRow>
            ) : entries.map((entry) => {
              const isEditing = editingId === entry.id
              const editable = isWithinEditWindow(entry.entry_date, 7)

              return (
                <TableRow key={entry.id} className={isEditing ? "bg-primary/5" : ""}>
                  {/* Date */}
                  <TableCell className="text-xs font-mono">
                    <div className="flex items-center gap-1">
                      {formatDateBogota(entry.entry_date)}
                      {!editable && (
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      )}
                    </div>
                  </TableCell>

                  {/* Client */}
                  <TableCell className="text-xs font-medium">
                    {(entry.client as any)?.name || "—"}
                  </TableCell>

                  {/* Matter */}
                  <TableCell className="text-xs text-muted-foreground">
                    {(entry.matter as any)?.name || "—"}
                  </TableCell>

                  {/* Duration */}
                  <TableCell className="text-xs">
                    {isEditing ? (
                      <Input
                        type="number"
                        min={1}
                        value={editValues?.duration_minutes || 0}
                        onChange={(e) =>
                          setEditValues((v) => v ? { ...v, duration_minutes: parseInt(e.target.value) || 0 } : null)
                        }
                        className="h-7 w-16 text-xs font-mono"
                      />
                    ) : (
                      <span className="font-mono font-medium">
                        {formatDuration(entry.duration_minutes)}
                      </span>
                    )}
                  </TableCell>

                  {/* Description */}
                  <TableCell className="text-xs max-w-48 truncate">
                    {isEditing ? (
                      <Input
                        value={editValues?.description || ""}
                        onChange={(e) =>
                          setEditValues((v) => v ? { ...v, description: e.target.value } : null)
                        }
                        className="h-7 text-xs"
                        placeholder="Descripción"
                      />
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1.5">
                        {(entry as any).shared_task_id && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5 shrink-0 border-blue-400/40 text-blue-400">
                            <Users className="h-2.5 w-2.5" />
                            Compartida
                          </Badge>
                        )}
                        {entry.description || "—"}
                      </span>
                    )}
                  </TableCell>

                  {/* Category */}
                  <TableCell className="text-xs">
                    {entry.category ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {CATEGORIES.find((c) => c.value === entry.category)?.label || entry.category}
                      </Badge>
                    ) : "—"}
                  </TableCell>

                  {/* Billable */}
                  <TableCell className="text-center">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editValues?.is_billable || false}
                        onChange={(e) =>
                          setEditValues((v) => v ? { ...v, is_billable: e.target.checked } : null)
                        }
                        className="h-3.5 w-3.5"
                      />
                    ) : (
                      <span className={entry.is_billable ? "text-green-600" : "text-muted-foreground"}>
                        {entry.is_billable ? "✓" : "—"}
                      </span>
                    )}
                  </TableCell>

                  {/* Source */}
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {entry.source === "timer" ? "⏱ Timer" :
                       entry.source === "manual" ? "✏️ Manual" :
                       entry.source}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => saveEdit(entry.id)}
                          className="p-1 hover:bg-green-100 rounded cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 hover:bg-red-100 rounded cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      </div>
                    ) : editable ? (
                      <button
                        onClick={() => startEdit(entry)}
                        className="p-1 hover:bg-muted rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
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
