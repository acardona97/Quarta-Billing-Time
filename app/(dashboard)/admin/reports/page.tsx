"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { todayBogota, startOfWeekBogota, startOfMonthBogota } from "@/lib/utils/date"
import { toast } from "sonner"
import {
  FileDown, FileSpreadsheet, BarChart3, Download,
  Calendar, Users, Building2, Receipt,
} from "lucide-react"
import { groupedWorkbook, matrixWorkbook, downloadWorkbook, type ReportEntry } from "@/lib/excel-report"

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

  async function fetchEntries(): Promise<ReportEntry[]> {
    const { data, error } = await supabase.rpc("report_time_entries", {
      p_from: dateFrom,
      p_to: dateTo,
    })
    if (error) {
      toast.error("Error: " + error.message)
      return []
    }
    return (data || []).map((r: any) => ({
      entry_date: r.entry_date,
      user: { full_name: r.user_name },
      client: { name: r.client_name },
      matter: {
        name: r.matter_name,
        billing_type: r.billing_type,
        hourly_rate: r.hourly_rate,
      },
      duration_minutes: r.duration_minutes,
      is_billable: r.is_billable,
      applied_rate: r.applied_rate,
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

      const period = `${dateFrom} a ${dateTo}`
      let wb
      let filename = "reporte"

      switch (reportType) {
        case "hours_by_attorney":
          wb = groupedWorkbook({ title: "Horas por Abogado", period, groupBy: "attorney", entries })
          filename = `horas-por-abogado_${dateFrom}_${dateTo}`
          break
        case "hours_by_client":
          wb = groupedWorkbook({ title: "Horas por Cliente", period, groupBy: "client", entries })
          filename = `horas-por-cliente_${dateFrom}_${dateTo}`
          break
        case "attorney_client_matrix":
          wb = matrixWorkbook({ period, entries })
          filename = `abogados-por-cliente_${dateFrom}_${dateTo}`
          break
        case "cap_consumption":
          wb = groupedWorkbook({
            title: "Consumo de Paquete (Fee)",
            period,
            groupBy: "client",
            entries: entries.filter((e) => (e.matter?.billing_type || "") === "fee"),
          })
          filename = `consumo-paquete_${dateFrom}_${dateTo}`
          break
        case "pre_invoice":
          wb = groupedWorkbook({
            title: "Pre-factura (facturables)",
            period,
            groupBy: "client",
            entries: entries.filter((e) => e.is_billable !== false),
            withValue: true,
          })
          filename = `pre-factura_${dateFrom}_${dateTo}`
          break
        case "billing_tracking":
          wb = groupedWorkbook({
            title: "Seguimiento de Facturación",
            period,
            groupBy: "attorney",
            entries,
            withValue: true,
          })
          filename = `seguimiento-facturacion_${dateFrom}_${dateTo}`
          break
      }

      if (wb) {
        await downloadWorkbook(wb, filename)
        toast.success(`Excel descargado: ${filename}.xlsx`)
      }
    } catch (err: any) {
      toast.error("Error generando Excel: " + (err?.message || ""))
    }
    setGenerating(false)
  }

  const REPORTS: { type: ReportType; label: string; description: string; icon: React.ReactNode }[] = [
    {
      type: "hours_by_attorney",
      label: "Horas por abogado",
      description: "Agrupado por abogado, con subtotales y total",
      icon: <Users className="h-4 w-4" />,
    },
    {
      type: "hours_by_client",
      label: "Horas por cliente",
      description: "Agrupado por cliente, con subtotales y total",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      type: "attorney_client_matrix",
      label: "Abogados × Clientes",
      description: "Matriz cruzada de horas con totales por fila y columna",
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      type: "cap_consumption",
      label: "Consumo de paquete",
      description: "Horas fee por cliente, agrupadas con subtotales",
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      type: "pre_invoice",
      label: "Pre-factura",
      description: "Facturables por cliente con valor COP y total",
      icon: <FileDown className="h-4 w-4" />,
    },
    {
      type: "billing_tracking",
      label: "Seguimiento de facturación",
      description: "Por abogado, horas y valor a facturar",
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
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1" onClick={setToday}>
              Hoy
            </Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1" onClick={setThisWeek}>
              Esta semana
            </Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1" onClick={setThisMonth}>
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
