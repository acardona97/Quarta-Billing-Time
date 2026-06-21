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

// ── Paleta para abogados (8 colores accent, fondo suave) ──
const ATTY_PALETTE = [
  { bg: "FFE8F0FE", fg: "FF1D4ED8" }, // blue
  { bg: "FFFCE8FF", fg: "FF7C3AED" }, // violet
  { bg: "FFE8FEF0", fg: "FF059669" }, // emerald
  { bg: "FFFEF3E8", fg: "FFD97706" }, // amber
  { bg: "FFFEE8E8", fg: "FFDC2626" }, // red
  { bg: "FFE8FEFE", fg: "FF0891B2" }, // cyan
  { bg: "FFF0FEE8", fg: "FF65A30D" }, // lime
  { bg: "FFFFF8E8", fg: "FFC2410C" }, // orange
]

function colLetter(n: number): string {
  let s = ""
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ── Matriz Abogado × Cliente — 3 hojas: Mapa de Calor · Por Abogado · Por Cliente ──
export function matrixWorkbook(opts: { period: string; entries: ReportEntry[] }): ExcelJS.Workbook {
  const { period, entries } = opts
  const wb = new ExcelJS.Workbook()
  wb.creator = "Quarta Billing Time"

  const attorneys = [...new Set(entries.map((e) => e.user?.full_name || "(Sin asignar)"))].sort()
  const clients = [...new Set(entries.map((e) => e.client?.name || "(Sin cliente)"))].sort()

  // Build lookup min[attorney][client]
  const cell = new Map<string, number>()
  for (const e of entries) {
    const k = `${e.user?.full_name || "(Sin asignar)"}|${e.client?.name || "(Sin cliente)"}`
    cell.set(k, (cell.get(k) || 0) + e.duration_minutes)
  }

  // ── HOJA 1: Mapa de Calor ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Mapa de Calor")
  const span1 = clients.length + 2
  titleBlock(ws1, "Abogados × Clientes — Mapa de Calor (horas)", period, span1)
  headerRow(ws1, ["Abogado", ...clients, "TOTAL"])

  const dataStartRow = ws1.lastRow!.number + 1
  for (const a of attorneys) {
    let total = 0
    const vals: any[] = [a]
    for (const c of clients) {
      const m = cell.get(`${a}|${c}`) || 0
      vals.push(m > 0 ? m / 60 : "")
      total += m
    }
    vals.push(total / 60)
    const r = ws1.addRow(vals)
    r.getCell(1).font = { bold: true, color: { argb: NAVY } }
    r.eachCell((c, i) => {
      c.border = allBorders
      if (i >= 2) c.numFmt = "#,##0.00"
      if (i === clients.length + 2) c.font = { bold: true }
    })
  }
  const dataEndRow = ws1.lastRow!.number

  // Totals row
  const colTotals: any[] = ["TOTAL"]
  let grand1 = 0
  for (const c of clients) {
    let t = 0
    for (const a of attorneys) t += cell.get(`${a}|${c}`) || 0
    colTotals.push(t / 60)
    grand1 += t
  }
  colTotals.push(grand1 / 60)
  const tr1 = ws1.addRow(colTotals)
  tr1.eachCell((c, i) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE } }
    c.border = allBorders
    if (i >= 2) c.numFmt = "#,##0.00"
  })

  // ColorScale: blanco → azul claro → navy sobre celdas de datos (cols 2..n+1)
  if (dataEndRow >= dataStartRow && clients.length > 0) {
    const lastDataCol = colLetter(clients.length + 1)
    ws1.addConditionalFormatting({
      ref: `B${dataStartRow}:${lastDataCol}${dataEndRow}`,
      rules: [
        {
          type: "colorScale",
          cfvo: [{ type: "min" }, { type: "percentile", value: 60 }, { type: "max" }],
          color: [
            { argb: "FFFFFFFF" },   // blanco = 0 h
            { argb: "FFB3D4F0" },   // azul claro = medio
            { argb: "FF1B3A5C" },   // navy = máximo
          ],
          priority: 1,
        } as any,
      ],
    })
  }

  ws1.columns.forEach((c, i) => (c.width = i === 0 ? 26 : Math.max(10, clients[i - 1]?.length * 0.9 || 12)))
  ws1.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }]

  // ── HOJA 2: Por Abogado ───────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Por Abogado")
  titleBlock(ws2, "Horas por Abogado · desglose por cliente", period, 4)
  headerRow(ws2, ["Cliente", "Horas", "Duración", "% del abogado"])

  for (let ai = 0; ai < attorneys.length; ai++) {
    const a = attorneys[ai]
    const palette = ATTY_PALETTE[ai % ATTY_PALETTE.length]
    const attyMin = [...clients].reduce((s, c) => s + (cell.get(`${a}|${c}`) || 0), 0)

    // Encabezado de abogado
    const gh = ws2.addRow([a, "", "", ""])
    ws2.mergeCells(gh.number, 1, gh.number, 4)
    gh.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.bg } }
    gh.getCell(1).font = { bold: true, color: { argb: palette.fg }, size: 11 }
    gh.getCell(1).border = allBorders

    // Clientes de este abogado (solo los que tienen horas)
    const attyClients = clients
      .map((c) => ({ name: c, min: cell.get(`${a}|${c}`) || 0 }))
      .filter((x) => x.min > 0)
      .sort((a, b) => b.min - a.min)

    const groupStart = ws2.lastRow!.number + 1
    for (const { name, min } of attyClients) {
      const pct = attyMin > 0 ? min / attyMin : 0
      const r = ws2.addRow([name, min / 60, durText(min), pct])
      r.eachCell((c) => (c.border = allBorders))
      r.getCell(2).numFmt = "#,##0.00"
      r.getCell(4).numFmt = "0.0%"
      r.outlineLevel = 1
    }
    const groupEnd = ws2.lastRow!.number

    // dataBar en columna Horas de este grupo
    if (groupEnd >= groupStart) {
      ws2.addConditionalFormatting({
        ref: `B${groupStart}:B${groupEnd}`,
        rules: [
          {
            type: "dataBar",
            cfvo: [{ type: "min" }, { type: "max" }],
            color: { argb: palette.fg },
            priority: ai + 1,
          } as any,
        ],
      })
    }

    // Subtotal abogado
    const sub = ws2.addRow(["", attyMin / 60, durText(attyMin), 1])
    sub.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.bg } }
      c.font = { bold: true, color: { argb: palette.fg } }
      c.border = allBorders
    })
    sub.getCell(1).value = `Subtotal ${a}`
    sub.getCell(2).numFmt = "#,##0.00"
    sub.getCell(4).numFmt = "0.0%"
  }

  // Total general
  const grandMin2 = attorneys.reduce((s, a) =>
    s + [...clients].reduce((cs, c) => cs + (cell.get(`${a}|${c}`) || 0), 0), 0)
  const gt2 = ws2.addRow(["TOTAL FIRMA", grandMin2 / 60, durText(grandMin2), ""])
  gt2.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE } }
    c.border = allBorders
  })
  gt2.getCell(2).numFmt = "#,##0.00"
  ws2.columns.forEach((c, i) => (c.width = [30, 10, 12, 14][i] || 12))
  ws2.views = [{ state: "frozen", ySplit: 4 }]

  // ── HOJA 3: Por Cliente ────────────────────────────────────────────────
  const ws3 = wb.addWorksheet("Por Cliente")
  titleBlock(ws3, "Horas por Cliente · desglose por abogado", period, 4)
  headerRow(ws3, ["Abogado", "Horas", "Duración", "% del cliente"])

  for (let ci = 0; ci < clients.length; ci++) {
    const c = clients[ci]
    const palette = ATTY_PALETTE[ci % ATTY_PALETTE.length]
    const clientMin = attorneys.reduce((s, a) => s + (cell.get(`${a}|${c}`) || 0), 0)
    if (clientMin === 0) continue

    // Encabezado cliente
    const gh = ws3.addRow([c, "", "", ""])
    ws3.mergeCells(gh.number, 1, gh.number, 4)
    gh.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.bg } }
    gh.getCell(1).font = { bold: true, color: { argb: palette.fg }, size: 11 }
    gh.getCell(1).border = allBorders

    const clientAttorneys = attorneys
      .map((a) => ({ name: a, min: cell.get(`${a}|${c}`) || 0 }))
      .filter((x) => x.min > 0)
      .sort((a, b) => b.min - a.min)

    const groupStart3 = ws3.lastRow!.number + 1
    for (const { name, min } of clientAttorneys) {
      const pct = clientMin > 0 ? min / clientMin : 0
      const r = ws3.addRow([name, min / 60, durText(min), pct])
      r.eachCell((cc) => (cc.border = allBorders))
      r.getCell(2).numFmt = "#,##0.00"
      r.getCell(4).numFmt = "0.0%"
      r.outlineLevel = 1
    }
    const groupEnd3 = ws3.lastRow!.number

    if (groupEnd3 >= groupStart3) {
      ws3.addConditionalFormatting({
        ref: `B${groupStart3}:B${groupEnd3}`,
        rules: [
          {
            type: "dataBar",
            cfvo: [{ type: "min" }, { type: "max" }],
            color: { argb: palette.fg },
            priority: ci + 1,
          } as any,
        ],
      })
    }

    const sub3 = ws3.addRow(["", clientMin / 60, durText(clientMin), 1])
    sub3.eachCell((cc) => {
      cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.bg } }
      cc.font = { bold: true, color: { argb: palette.fg } }
      cc.border = allBorders
    })
    sub3.getCell(1).value = `Subtotal ${c}`
    sub3.getCell(2).numFmt = "#,##0.00"
    sub3.getCell(4).numFmt = "0.0%"
  }

  const grandMin3 = clients.reduce((s, c) =>
    s + attorneys.reduce((as, a) => as + (cell.get(`${a}|${c}`) || 0), 0), 0)
  const gt3 = ws3.addRow(["TOTAL FIRMA", grandMin3 / 60, durText(grandMin3), ""])
  gt3.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    c.font = { bold: true, color: { argb: WHITE } }
    c.border = allBorders
  })
  gt3.getCell(2).numFmt = "#,##0.00"
  ws3.columns.forEach((c, i) => (c.width = [30, 10, 12, 14][i] || 12))
  ws3.views = [{ state: "frozen", ySplit: 4 }]

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
