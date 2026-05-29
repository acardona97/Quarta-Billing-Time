"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatDuration } from "@/lib/utils/duration"
import { todayBogota, startOfWeekBogota, startOfMonthBogota } from "@/lib/utils/date"
import { toast } from "sonner"
import {
  FileDown, FileSpreadsheet, FileText, BarChart3, Download,
  Calendar, Users, Building2,
} from "lucide-react"
import * as XLSX from "xlsx"

type ReportType =
  | "hours_by_attorney"
  | "hours_by_client"
  | "attorney_client_matrix"
  | "cap_consumption"
  | "pre_invoice"

export default function ReportsPage() {
  const supabase = createClient()
  const [reportType, setReportType] = useState<ReportType>("hours_by_attorney")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [generating, setGenerating] = useState(false)

  // Quick period presets
  function setToday() {
    const t = todayBogota()
    setDateFrom(t)
    setDateTo(t)
  }
  function setThisWeek() {
    setDateFrom(startOfWeekBogota())
    setDateTo(todayBogota())
  }
  function setThisMonth() {
    setDateFrom(startOfMonthBogota())
    setDateTo(todayBogota())
  }

  async function fetchEntries() {
    const { data: entries } = await supabase
      .from("time_entries")
      .select(`
        *,
        user:users(full_name),
        client:clients(name, billing_type, monthly_hour_cap),
        matter:matters(name)
      `)
      .gte("entry_date", dateFrom)
      .lte("entry_date", dateTo)
      .order("entry_date")
    return entries || []
  }

  async function generateExcel() {
    if (!dateFrom || !dateTo) {
      toast.error("Selecciona rango de fechas")
      return
    }

    setGenerating(true)
    try {
      const entries = await fetchEntries()

      if (entries.length === 0) {
        toast.error("Sin datos para el rango seleccionado")
        setGenerating(false)
        return
      }

      const wb = XLSX.utils.book_new()
      let filename = "reporte"

      switch (reportType) {
        case "hours_by_attorney": {
          filename = `horas-por-abogado_${dateFrom}_${dateTo}`
          const rows = entries.map((e: any) => ({
            Abogado: e.user?.full_name || "",
            Fecha: e.entry_date,
            Cliente: e.client?.name || "",
            Asunto: e.matter?.name || "",
            "Duracion (min)": e.duration_minutes,
            Duracion: formatDuration(e.duration_minutes),
            Facturable: e.is_billable ? "Si" : "No",
            Categoria: e.category || "",
            Fuente: e.source,
          }))
          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
            { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Horas por Abogado")
          break
        }

        case "hours_by_client": {
          filename = `horas-por-cliente_${dateFrom}_${dateTo}`
          const rows = entries.map((e: any) => ({
            Cliente: e.client?.name || "",
            Fecha: e.entry_date,
            Abogado: e.user?.full_name || "",
            Asunto: e.matter?.name || "",
            "Duracion (min)": e.duration_minutes,
            Duracion: formatDuration(e.duration_minutes),
            Facturable: e.is_billable ? "Si" : "No",
            Descripcion: e.description || "",
          }))
          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
            { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 40 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Horas por Cliente")
          break
        }

        case "attorney_client_matrix": {
          filename = `abogados-por-cliente_${dateFrom}_${dateTo}`

          // Build matrix: rows = attorneys, columns = clients, cells = total hours
          const attorneyMap = new Map<string, string>()
          const clientMap = new Map<string, string>()
          const matrix = new Map<string, Map<string, number>>()

          entries.forEach((e: any) => {
            const aName = e.user?.full_name || "Desconocido"
            const cName = e.client?.name || "Desconocido"
            attorneyMap.set(e.user_id, aName)
            clientMap.set(e.client_id, cName)

            if (!matrix.has(e.user_id)) matrix.set(e.user_id, new Map())
            const row = matrix.get(e.user_id)!
            row.set(e.client_id, (row.get(e.client_id) || 0) + e.duration_minutes)
          })

          const clientIds = Array.from(clientMap.keys())
          const rows: Record<string, any>[] = []

          for (const [aId, aName] of attorneyMap.entries()) {
            const row: Record<string, any> = { Abogado: aName }
            let total = 0
            for (const cId of clientIds) {
              const mins = matrix.get(aId)?.get(cId) || 0
              row[clientMap.get(cId)!] = mins > 0 ? formatDuration(mins) : ""
              total += mins
            }
            row["TOTAL"] = formatDuration(total)
            rows.push(row)
          }

          // Totals row
          const totalsRow: Record<string, any> = { Abogado: "TOTAL" }
          let grandTotal = 0
          for (const cId of clientIds) {
            let colTotal = 0
            for (const [aId] of attorneyMap.entries()) {
              colTotal += matrix.get(aId)?.get(cId) || 0
            }
            totalsRow[clientMap.get(cId)!] = formatDuration(colTotal)
            grandTotal += colTotal
          }
          totalsRow["TOTAL"] = formatDuration(grandTotal)
          rows.push(totalsRow)

          const ws = XLSX.utils.json_to_sheet(rows)
          XLSX.utils.book_append_sheet(wb, ws, "Matriz Abogado-Cliente")

          // Also add detail sheet
          const detailRows = entries.map((e: any) => ({
            Abogado: e.user?.full_name || "",
            Cliente: e.client?.name || "",
            Asunto: e.matter?.name || "",
            Fecha: e.entry_date,
            "Duracion (min)": e.duration_minutes,
            Duracion: formatDuration(e.duration_minutes),
            Descripcion: e.description || "",
            Facturable: e.is_billable ? "Si" : "No",
          }))
          const ws2 = XLSX.utils.json_to_sheet(detailRows)
          ws2["!cols"] = [
            { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 12 },
            { wch: 14 }, { wch: 10 }, { wch: 40 }, { wch: 10 },
          ]
          XLSX.utils.book_append_sheet(wb, ws2, "Detalle")
          break
        }

        case "cap_consumption": {
          filename = `consumo-cap_${dateFrom}_${dateTo}`
          const { data: clients } = await supabase
            .from("clients")
            .select("id, name, billing_type, monthly_hour_cap")
            .eq("billing_type", "fee")

          // Summary sheet
          const summaryRows = (clients || []).map((c: any) => {
            const clientEntries = entries.filter((e: any) => e.client_id === c.id)
            const mins = clientEntries.reduce((s: number, e: any) => s + e.duration_minutes, 0)
            const pct = c.monthly_hour_cap ? Math.round((mins / c.monthly_hour_cap) * 100) : 0
            return {
              Cliente: c.name,
              "Cap Mensual (h)": c.monthly_hour_cap ? Math.round(c.monthly_hour_cap / 60) : 0,
              "Cap Mensual": formatDuration(c.monthly_hour_cap || 0),
              "Consumido (min)": mins,
              Consumido: formatDuration(mins),
              Porcentaje: `${pct}%`,
              Estado: pct >= 100 ? "⚠️ EXCEDIDO" : pct >= 80 ? "⚠️ ALERTA" : "✅ OK",
            }
          })
          const ws = XLSX.utils.json_to_sheet(summaryRows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
            { wch: 12 }, { wch: 12 }, { wch: 14 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Consumo Paquete")

          // Detail by attorney per cap client
          const detailRows = entries
            .filter((e: any) => (clients || []).some((c: any) => c.id === e.client_id))
            .map((e: any) => ({
              Cliente: e.client?.name || "",
              Abogado: e.user?.full_name || "",
              Fecha: e.entry_date,
              Asunto: e.matter?.name || "",
              "Duracion (min)": e.duration_minutes,
              Duracion: formatDuration(e.duration_minutes),
              Descripcion: e.description || "",
            }))
          const ws2 = XLSX.utils.json_to_sheet(detailRows)
          XLSX.utils.book_append_sheet(wb, ws2, "Detalle Paquete")
          break
        }

        case "pre_invoice": {
          filename = `pre-factura_${dateFrom}_${dateTo}`
          const billable = entries.filter((e: any) => e.is_billable)

          // Group by client
          const clientGroups = new Map<string, typeof billable>()
          billable.forEach((e: any) => {
            const cName = e.client?.name || "Sin cliente"
            if (!clientGroups.has(cName)) clientGroups.set(cName, [])
            clientGroups.get(cName)!.push(e)
          })

          const rows = billable.map((e: any) => {
            const subtotal = e.applied_rate ? Math.round((e.duration_minutes / 60) * e.applied_rate) : 0
            return {
              Cliente: e.client?.name || "",
              Asunto: e.matter?.name || "",
              Abogado: e.user?.full_name || "",
              Fecha: e.entry_date,
              Descripcion: e.description || "",
              "Duracion (min)": e.duration_minutes,
              Duracion: formatDuration(e.duration_minutes),
              "Tarifa (COP)": e.applied_rate || 0,
              "Subtotal (COP)": subtotal,
            }
          })
          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 12 },
            { wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Pre-factura")
          break
        }
      }

      XLSX.writeFile(wb, `${filename}.xlsx`)
      toast.success(`Excel descargado: ${filename}.xlsx`)
    } catch (err) {
      toast.error("Error generando Excel")
    }
    setGenerating(false)
  }

  const REPORTS: { type: ReportType; label: string; description: string; icon: React.ReactNode }[] = [
    {
      type: "hours_by_attorney",
      label: "Horas por abogado",
      description: "Detalle de entradas por cada abogado en el período",
      icon: <Users className="h-4 w-4" />,
    },
    {
      type: "hours_by_client",
      label: "Horas por cliente",
      description: "Detalle de consumo por cada cliente",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      type: "attorney_client_matrix",
      label: "Abogados × Clientes",
      description: "Matriz cruzada: cuántas horas reportó cada abogado a cada cliente",
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      type: "cap_consumption",
      label: "Consumo de paquete",
      description: "Clientes fee: consumo vs. cap con detalle por abogado",
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      type: "pre_invoice",
      label: "Pre-factura",
      description: "Horas facturables con tarifa y subtotal",
      icon: <FileDown className="h-4 w-4" />,
    },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileDown className="h-6 w-6 text-primary" />
          Reportes
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Exportar datos de todos los abogados para análisis y facturación
        </p>
      </div>

      {/* Report type cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Card
            key={r.type}
            className={`cursor-pointer transition-colors hover:border-primary/50 ${
              reportType === r.type ? "border-primary bg-primary/5" : ""
            }`}
            onClick={() => setReportType(r.type)}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${reportType === r.type ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                  {r.icon}
                </div>
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground">{r.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Date range + generate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Período del reporte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick period buttons */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1"
              onClick={setToday}
            >
              Hoy
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1"
              onClick={setThisWeek}
            >
              Esta semana
            </Badge>
            <Badge
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1"
              onClick={setThisMonth}
            >
              Este mes
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Desde</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Hasta</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <Button
            onClick={generateExcel}
            disabled={generating || !dateFrom || !dateTo}
            className="w-full cursor-pointer gap-2"
          >
            <Download className="h-4 w-4" />
            {generating ? "Generando..." : "Descargar Excel"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
