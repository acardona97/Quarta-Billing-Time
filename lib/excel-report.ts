import ExcelJS from "exceljs"

// ── Paleta corporativa minimalista ──
const NAVY = "FF1B3A5C"      // encabezados / total general
const GROUP = "FFE3EBF4"     // fila de grupo
const SUBTOTAL = "FFF2F6FB"  // subtotal
const BORDER = "FFD8DEE6"
const WHITE = "FFFFFFFF"
const BAR = "FF3B82F6"       // barra de datos (mini-gráfico)

const thin = { style: "thin" as const, color: { argb: BORDER } }
const allBorders = { top: thin, left: thin, bottom: thin, right: thin }

const BILLING_LABEL: Record<string, string> = {
  fee: "Fee/Paquete",
  hourly: "Postpago",
  project: "Proyecto",
}

export interface ReportEntry {
  entry_date: string
  user?: { full_name?: string }
  client?: { name?: string }
  matter?: { name?: string; billing_type?: string; hourly_rate?: number | null }
  duration_minutes: number
  is_billable?: boolean
  applied_rate?: number | null
}

function durText(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`
}

function entryValueCOP(e: ReportEntry) {
  if ((e.matter?.billing_type || "") !== "hourly") return 0
  const rate = e.applied_rate || e.matter?.hourly_rate || 0
  return Math.round((e.duration_minutes / 60) * rate)
}

function headerRow(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.addRow(labels)
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE }, size: 11 }
    c.alignment = { vertical: "middle", horizontal: "left" }
    c.border = allBorders
  })
  row.height = 20
  return row
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, period: string, span: number) {
  const t = ws.addRow([title])
  ws.mergeCells(t.number, 1, t.number, span)
  t.getCell(1).font = { bold: true, size: 15, color: { argb: NAVY } }
  t.height = 24
  const p = ws.addRow([`Período: ${period}`])
  ws.mergeCells(p.number, 1, p.number, span)
  p.getCell(1).font = { italic: true, size: 10, color: { argb: "FF6B7785" } }
  ws.addRow([])
}

// ── Reporte agrupado (por cliente o por abogado) con subtotales + total ──
// groupBy: "client" | "attorney". withValue añade columna Valor COP (postpago).
export function groupedWorkbook(opts: {
  title: string
  period: string
  groupBy: "client" | "attorney"
  entries: ReportEntry[]
  withValue?: boolean
}): ExcelJS.Workbook {
  const { title, period, groupBy, entries, withValue } = opts
  const wb = new ExcelJS.Workbook()
  wb.creator = "Quarta Billing Time"

  const groupName = (e: ReportEntry) =>
    (groupBy === "client" ? e.client?.name : e.user?.full_name) || "(Sin asignar)"
  const secondLabel = groupBy === "client" ? "Abogado" : "Cliente"
  const secondVal = (e: ReportEntry) =>
    (groupBy === "client" ? e.user?.full_name : e.client?.name) || ""

  // Agrupar
  const groups = new Map<string, ReportEntry[]>()
  for (const e of entries) {
    const g = groupName(e)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(e)
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // ── Hoja Resumen (con barra de datos = mini-gráfico) ──
  const sum = wb.addWorksheet("Resumen")
  const sumCols = withValue ? 4 : 3
  titleBlock(sum, title, period, sumCols)
  const sumHeader = withValue
    ? [groupBy === "client" ? "Cliente" : "Abogado", "Horas", "Valor COP", "% horas"]
    : [groupBy === "client" ? "Cliente" : "Abogado", "Horas", "% horas"]
  headerRow(sum, sumHeader)

  const totalMin = entries.reduce((s, e) => s + e.duration_minutes, 0)
  const firstDataRow = sum.lastRow!.number + 1
  for (const [g, es] of sortedGroups) {
    const mins = es.reduce((s, e) => s + e.duration_minutes, 0)
    const pct = totalMin > 0 ? mins / totalMin : 0
    const row = withValue
      ? sum.addRow([g, mins / 60, es.reduce((s, e) => s + entryValueCOP(e), 0), pct])
      : sum.addRow([g, mins / 60, pct])
    row.eachCell((c) => (c.border = allBorders))
    row.getCell(2).numFmt = "#,##0.00"
    if (withValue) row.getCell(3).numFmt = "#,##0"
    row.getCell(withValue ? 4 : 3).numFmt = "0.0%"
  }
  const lastDataRow = sum.lastRow!.number
  // Total
  const tRow = withValue
    ? sum.addRow(["TOTAL", totalMin / 60, entries.reduce((s, e) => s + entryValueCOP(e), 0), 1])
    : sum.addRow(["TOTAL", totalMin / 60, 1])
  tRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE } }
    c.border = allBorders
  })
  tRow.getCell(2).numFmt = "#,##0.00"
  if (withValue) tRow.getCell(3).numFmt = "#,##0"
  tRow.getCell(withValue ? 4 : 3).numFmt = "0.0%"

  // Barra de datos sobre la columna Horas (mini-gráfico inline)
  if (lastDataRow >= firstDataRow) {
    sum.addConditionalFormatting({
      ref: `B${firstDataRow}:B${lastDataRow}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [{ type: "min" }, { type: "max" }],
          color: { argb: BAR },
          priority: 1,
        } as any,
      ],
    })
  }
  sum.columns.forEach((c, i) => (c.width = i === 0 ? 30 : 14))

  // ── Hoja Detalle agrupada ──
  const det = wb.addWorksheet("Detalle")
  const cols = ["Fecha", secondLabel, "Asunto", "Tipo", "Facturable", "Horas", "Duración"]
  if (withValue) cols.push("Valor COP")
  titleBlock(det, title, period, cols.length)
  headerRow(det, cols)

  let grand = 0
  let grandVal = 0
  for (const [g, es] of sortedGroups) {
    // Fila de grupo
    const gMin = es.reduce((s, e) => s + e.duration_minutes, 0)
    const gRow = det.addRow([g])
    det.mergeCells(gRow.number, 1, gRow.number, cols.length)
    gRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP } }
    gRow.getCell(1).font = { bold: true, color: { argb: NAVY } }
    gRow.getCell(1).border = allBorders

    es.sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    for (const e of es) {
      const r = det.addRow([
        e.entry_date,
        secondVal(e),
        e.matter?.name || "",
        BILLING_LABEL[e.matter?.billing_type || ""] || "—",
        e.is_billable === false ? "No" : "Sí",
        e.duration_minutes / 60,
        durText(e.duration_minutes),
        ...(withValue ? [entryValueCOP(e)] : []),
      ])
      r.eachCell((c) => (c.border = allBorders))
      r.getCell(6).numFmt = "#,##0.00"
      if (withValue) r.getCell(8).numFmt = "#,##0"
      r.outlineLevel = 1
    }

    // Subtotal del grupo
    const subVals: any[] = ["", "", "", "", "Subtotal", gMin / 60, durText(gMin)]
    if (withValue) subVals.push(es.reduce((s, e) => s + entryValueCOP(e), 0))
    const sub = det.addRow(subVals)
    sub.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL } }
      c.font = { bold: true }
      c.border = allBorders
    })
    sub.getCell(6).numFmt = "#,##0.00"
    if (withValue) sub.getCell(8).numFmt = "#,##0"
    grand += gMin
    grandVal += es.reduce((s, e) => s + entryValueCOP(e), 0)
  }

  // Total general
  const gVals: any[] = ["", "", "", "", "TOTAL", grand / 60, durText(grand)]
  if (withValue) gVals.push(grandVal)
  const gt = det.addRow(gVals)
  gt.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE } }
    c.border = allBorders
  })
  gt.getCell(6).numFmt = "#,##0.00"
  if (withValue) gt.getCell(8).numFmt = "#,##0"

  det.columns.forEach((c, i) => (c.width = [12, 24, 26, 12, 11, 9, 11, 14][i] || 12))
  det.views = [{ state: "frozen", ySplit: 4 }]
  return wb
}

// ── Matriz Abogado × Cliente (cruzada) estilizada ──
export function matrixWorkbook(opts: { period: string; entries: ReportEntry[] }): ExcelJS.Workbook {
  const { period, entries } = opts
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Matriz")

  const attorneys = [...new Set(entries.map((e) => e.user?.full_name || "(Sin asignar)"))].sort()
  const clients = [...new Set(entries.map((e) => e.client?.name || "(Sin cliente)"))].sort()

  const cell = new Map<string, number>()
  for (const e of entries) {
    const k = `${e.user?.full_name || "(Sin asignar)"}|${e.client?.name || "(Sin cliente)"}`
    cell.set(k, (cell.get(k) || 0) + e.duration_minutes)
  }

  titleBlock(ws, "Abogados × Clientes (horas)", period, clients.length + 2)
  headerRow(ws, ["Abogado", ...clients, "TOTAL"])

  const firstRow = ws.lastRow!.number + 1
  for (const a of attorneys) {
    let total = 0
    const vals: any[] = [a]
    for (const c of clients) {
      const m = cell.get(`${a}|${c}`) || 0
      vals.push(m > 0 ? m / 60 : "")
      total += m
    }
    vals.push(total / 60)
    const r = ws.addRow(vals)
    r.eachCell((c, i) => {
      c.border = allBorders
      if (i >= 2) c.numFmt = "#,##0.00"
    })
    r.getCell(clients.length + 2).font = { bold: true }
  }
  // Totales por cliente
  const totalsVals: any[] = ["TOTAL"]
  let grand = 0
  for (const c of clients) {
    let colTotal = 0
    for (const a of attorneys) colTotal += cell.get(`${a}|${c}`) || 0
    totalsVals.push(colTotal / 60)
    grand += colTotal
  }
  totalsVals.push(grand / 60)
  const tr = ws.addRow(totalsVals)
  tr.eachCell((c, i) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE } }
    c.border = allBorders
    if (i >= 2) c.numFmt = "#,##0.00"
  })
  void firstRow
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 24 : 14))
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }]
  return wb
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
