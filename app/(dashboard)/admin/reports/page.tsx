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
  Calendar, Users, Building2, Receipt,
} from "lucide-react"
import * as XLSX from "xlsx"

type ReportType =
  | "hours_by_attorney"
  | "hours_by_client"
  | "attorney_client_matrix"
  | "cap_consumption"
  | "pre_invoice"
  | "billing_tracking"

export default function ReportsPage() {
  const supabase = createClient()
  const [reportType, setReportType] = useState<ReportType>("hours_by_attorney")
  const [dateFrom, setDateFrom] = useState(() => startOfMonthBogota())
  const [dateTo, setDateTo] = useState(() => todayBogota())
  const [generating, setGenerating] = useState(false)

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
    const { data, error } = await supabase.rpc("report_time_entries", {
      p_from: dateFrom,
      p_to: dateTo,
    })
    if (error) {
      toast.error("Error: " + error.message)
      return []
    }
    // Map flat RPC rows to the nested shape the report builders expect
    return (data || []).map((r: any) => ({
      ...r,
      user: { full_name: r.user_name },
      client: { name: r.client_name },
      matter: {
        name: r.matter_name,
        billing_type: r.billing_type,
        hour_cap: r.hour_cap,
        hourly_rate: r.hourly_rate,
        fixed_fee: r.fixed_fee,
      },
    }))
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
        toast.error("Sin datos en el rango " + dateFrom + " a " + dateTo)
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
            "Tipo Cobro": e.matter?.billing_type || "",
            "Duracion (min)": e.duration_minutes,
            Duracion: formatDuration(e.duration_minutes),
            Facturable: e.is_billable ? "Sí" : "No",
            Categoria: e.category || "",
            Fuente: e.source,
          }))
          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 12 },
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
            "Tipo Cobro": e.matter?.billing_type || "",
            "Duracion (min)": e.duration_minutes,
            Duracion: formatDuration(e.duration_minutes),
            Facturable: e.is_billable ? "Sí" : "No",
            Descripcion: e.description || "",
          }))
          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 12 },
            { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 40 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Horas por Cliente")
          break
        }

        case "attorney_client_matrix": {
          filename = `abogados-por-cliente_${dateFrom}_${dateTo}`

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

          const detailRows = entries.map((e: any) => ({
            Abogado: e.user?.full_name || "",
            Cliente: e.client?.name || "",
            Asunto: e.matter?.name || "",
            Fecha: e.entry_date,
            "Duracion (min)": e.duration_minutes,
            Duracion: formatDuration(e.duration_minutes),
            Descripcion: e.description || "",
            Facturable: e.is_billable ? "Sí" : "No",
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
          filename = `consumo-paquete_${dateFrom}_${dateTo}`

          // Get all fee matters with their client info
          const { data: feeMatters } = await supabase
            .from("matters")
            .select("id, name, hour_cap, client_id, clients(name)")
            .eq("billing_type", "fee")
            .eq("is_active", true)

          const feeEntries = entries.filter((e: any) => e.matter?.billing_type === "fee")

          const summaryRows = (feeMatters || []).map((m: any) => {
            const mEntries = feeEntries.filter((e: any) => e.matter_id === m.id)
            const mins = mEntries.reduce((s: number, e: any) => s + e.duration_minutes, 0)
            const capMins = m.hour_cap || 0
            const pct = capMins > 0 ? Math.round((mins / capMins) * 100) : 0
            return {
              Cliente: m.clients?.name || "",
              Asunto: m.name,
              "Cap (horas)": capMins > 0 ? (capMins / 60).toFixed(1) : "Sin cap",
              "Cap (min)": capMins,
              "Consumido (min)": mins,
              Consumido: formatDuration(mins),
              Porcentaje: capMins > 0 ? `${pct}%` : "N/A",
              Estado: pct >= 100 ? "EXCEDIDO" : pct >= 80 ? "ALERTA" : "OK",
            }
          })
          const ws = XLSX.utils.json_to_sheet(summaryRows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
            { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Consumo Paquete")

          const detailRows = feeEntries.map((e: any) => ({
            Cliente: e.client?.name || "",
            Asunto: e.matter?.name || "",
            Abogado: e.user?.full_name || "",
            Fecha: e.entry_date,
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

          const rows = billable.map((e: any) => {
            const bt = e.matter?.billing_type || "hourly"
            const rate = e.applied_rate || e.matter?.hourly_rate || 0
            const hours = e.duration_minutes / 60
            const subtotal = bt === "hourly" ? Math.round(hours * rate) : 0
            return {
              Cliente: e.client?.name || "",
              Asunto: e.matter?.name || "",
              "Tipo Cobro": bt,
              Abogado: e.user?.full_name || "",
              Fecha: e.entry_date,
              Descripcion: e.description || "",
              "Duracion (min)": e.duration_minutes,
              Duracion: formatDuration(e.duration_minutes),
              "Tarifa Hora (COP)": bt === "hourly" ? rate : "",
              "Subtotal (COP)": bt === "hourly" ? subtotal : "",
            }
          })
          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 12 },
            { wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Pre-factura")

          // Summary by client and billing type
          const clientSummary = new Map<string, { fee: number; hourly: number; project: number; hourlyValue: number }>()
          billable.forEach((e: any) => {
            const cName = e.client?.name || "Sin cliente"
            if (!clientSummary.has(cName)) clientSummary.set(cName, { fee: 0, hourly: 0, project: 0, hourlyValue: 0 })
            const s = clientSummary.get(cName)!
            const bt = e.matter?.billing_type || "hourly"
            const rate = e.applied_rate || e.matter?.hourly_rate || 0
            if (bt === "fee") s.fee += e.duration_minutes
            else if (bt === "hourly") { s.hourly += e.duration_minutes; s.hourlyValue += Math.round((e.duration_minutes / 60) * rate) }
            else s.project += e.duration_minutes
          })

          const summaryRows = Array.from(clientSummary.entries()).map(([name, s]) => ({
            Cliente: name,
            "Fee/Paquete": formatDuration(s.fee),
            "Horas Postpago": formatDuration(s.hourly),
            "Valor Postpago (COP)": s.hourlyValue > 0 ? s.hourlyValue : "",
            "Proyecto": formatDuration(s.project),
            "Total Horas": formatDuration(s.fee + s.hourly + s.project),
          }))
          const ws2 = XLSX.utils.json_to_sheet(summaryRows)
          ws2["!cols"] = [
            { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
          ]
          XLSX.utils.book_append_sheet(wb, ws2, "Resumen por Cliente")
          break
        }

        case "billing_tracking": {
          filename = `seguimiento-facturacion_${dateFrom}_${dateTo}`

          // Group by attorney → client → matter
          const tracking = new Map<string, Map<string, { hours: number; billingType: string; rate: number; matterName: string }[]>>()

          entries.forEach((e: any) => {
            const aName = e.user?.full_name || "Desconocido"
            const cName = e.client?.name || "Sin cliente"
            if (!tracking.has(aName)) tracking.set(aName, new Map())
            const aMap = tracking.get(aName)!
            if (!aMap.has(cName)) aMap.set(cName, [])

            const existing = aMap.get(cName)!.find((m) => m.matterName === (e.matter?.name || "General"))
            if (existing) {
              existing.hours += e.duration_minutes
            } else {
              aMap.get(cName)!.push({
                hours: e.duration_minutes,
                billingType: e.matter?.billing_type || "hourly",
                rate: e.applied_rate || e.matter?.hourly_rate || 0,
                matterName: e.matter?.name || "General",
              })
            }
          })

          const rows: Record<string, any>[] = []
          for (const [attorney, clientMap] of tracking.entries()) {
            for (const [client, matters] of clientMap.entries()) {
              for (const m of matters) {
                const hours = m.hours / 60
                const value = m.billingType === "hourly" ? Math.round(hours * m.rate) : 0
                rows.push({
                  Abogado: attorney,
                  Cliente: client,
                  Asunto: m.matterName,
                  "Tipo Cobro": m.billingType === "fee" ? "Fee/Paquete" : m.billingType === "hourly" ? "Postpago" : "Proyecto",
                  "Horas Registradas": formatDuration(m.hours),
                  "Min Registrados": m.hours,
                  "Tarifa Hora": m.billingType === "hourly" ? m.rate : "",
                  "Valor a Facturar (COP)": m.billingType === "hourly" ? value : "",
                  "Valor a Facturar + IVA": m.billingType === "hourly" && value > 0 ? Math.round(value * 1.19) : "",
                })
              }
            }
          }

          const ws = XLSX.utils.json_to_sheet(rows)
          ws["!cols"] = [
            { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 14 },
            { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
          ]
          XLSX.utils.book_append_sheet(wb, ws, "Seguimiento Facturación")

          // Attorney summary
          const attorneySummary: Record<string, any>[] = []
          for (const [attorney, clientMap] of tracking.entries()) {
            let totalMins = 0
            let totalValue = 0
            let feeMins = 0
            let hourlyMins = 0
            let projectMins = 0

            for (const [, matters] of clientMap.entries()) {
              for (const m of matters) {
                totalMins += m.hours
                if (m.billingType === "fee") feeMins += m.hours
                else if (m.billingType === "hourly") {
                  hourlyMins += m.hours
                  totalValue += Math.round((m.hours / 60) * m.rate)
                }
                else projectMins += m.hours
              }
            }

            attorneySummary.push({
              Abogado: attorney,
              "Total Horas": formatDuration(totalMins),
              "Horas Fee": formatDuration(feeMins),
              "Horas Postpago": formatDuration(hourlyMins),
              "Horas Proyecto": formatDuration(projectMins),
              "Valor Postpago (COP)": totalValue > 0 ? totalValue : "",
              "Clientes Atendidos": clientMap.size,
            })
          }

          const ws2 = XLSX.utils.json_to_sheet(attorneySummary)
          ws2["!cols"] = [
            { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
            { wch: 16 }, { wch: 20 }, { wch: 18 },
          ]
          XLSX.utils.book_append_sheet(wb, ws2, "Resumen por Abogado")
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
      description: "Asuntos fee: consumo vs. cap con detalle por abogado",
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      type: "pre_invoice",
      label: "Pre-factura",
      description: "Horas facturables con tarifa, subtotal y resumen por cliente",
      icon: <FileDown className="h-4 w-4" />,
    },
    {
      type: "billing_tracking",
      label: "Seguimiento de facturación",
      description: "Horas registradas por abogado/cliente con valor a facturar por tipo",
      icon: <Receipt className="h-4 w-4" />,
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
