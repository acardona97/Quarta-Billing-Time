"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDuration } from "@/lib/utils/duration"
import { getWeekDates, startOfWeekBogota, todayBogota } from "@/lib/utils/date"
import { DEFAULT_DAILY_GOAL_MINUTES } from "@/lib/constants"
import { toast } from "sonner"
import { CalendarCheck, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Plus } from "lucide-react"

interface DayData {
  date: string
  dayName: string
  totalMinutes: number
  entries: { id: string; client_name: string; duration_minutes: number; description: string | null }[]
  isToday: boolean
  isFuture: boolean
}

export default function ReconciliationPage() {
  const supabase = createClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const [days, setDays] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL_MINUTES)

  const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

  useEffect(() => {
    loadWeek()
  }, [weekOffset])

  async function loadWeek() {
    setLoading(true)
    const today = todayBogota()
    const weekStart = startOfWeekBogota(weekOffset)
    const dates = getWeekDates(weekOffset)

    // Only weekdays (Mon-Fri)
    const weekdays = dates.slice(0, 5)

    const { data: entries } = await supabase
      .from("time_entries")
      .select(`
        id, entry_date, duration_minutes, description,
        client:clients(name)
      `)
      .gte("entry_date", weekdays[0])
      .lte("entry_date", weekdays[4])
      .order("entry_date")

    const dayMap: DayData[] = weekdays.map((date, i) => {
      const dayEntries = (entries || [])
        .filter((e) => e.entry_date === date)
        .map((e) => ({
          id: e.id,
          client_name: (e.client as any)?.name || "Sin cliente",
          duration_minutes: e.duration_minutes,
          description: e.description,
        }))

      return {
        date,
        dayName: DAY_NAMES[i],
        totalMinutes: dayEntries.reduce((sum, e) => sum + e.duration_minutes, 0),
        entries: dayEntries,
        isToday: date === today,
        isFuture: date > today,
      }
    })

    setDays(dayMap)
    setLoading(false)
  }

  const weekTotal = days.reduce((sum, d) => sum + d.totalMinutes, 0)
  const weekGoal = dailyGoal * 5
  const weekPercent = weekGoal > 0 ? Math.min((weekTotal / weekGoal) * 100, 100) : 0
  const gapDays = days.filter((d) => !d.isFuture && d.totalMinutes < dailyGoal)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            Resumen Semanal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reconciliación semanal — visualiza y completa gaps
          </p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {weekOffset === 0 ? "Esta semana" : weekOffset === -1 ? "Semana pasada" : `Hace ${Math.abs(weekOffset)} sem.`}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            disabled={weekOffset >= 0}
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week summary bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Semana: {formatDuration(weekTotal)} / {formatDuration(weekGoal)}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(weekPercent)}% completado
            </span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                weekPercent >= 100 ? "bg-green-500" :
                weekPercent >= 60 ? "bg-blue-500" :
                "bg-amber-500"
              }`}
              style={{ width: `${weekPercent}%` }}
            />
          </div>
          {gapDays.length > 0 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {gapDays.length} día{gapDays.length > 1 ? "s" : ""} con menos de {formatDuration(dailyGoal)} registradas
            </p>
          )}
        </CardContent>
      </Card>

      {/* Daily timeline */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando semana...</p>
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const percent = dailyGoal > 0 ? Math.min((day.totalMinutes / dailyGoal) * 100, 100) : 0
            const hasGap = !day.isFuture && day.totalMinutes < dailyGoal
            const isComplete = day.totalMinutes >= dailyGoal

            return (
              <Card
                key={day.date}
                className={`transition-colors ${
                  day.isToday ? "border-primary/50 bg-primary/5" :
                  day.isFuture ? "opacity-50" :
                  hasGap ? "border-amber-200 bg-amber-50/30" : ""
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-4">
                    {/* Day info */}
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        {day.dayName}
                        {day.isToday && <Badge className="text-[9px] px-1 py-0">Hoy</Badge>}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">{day.date}</p>
                    </div>

                    {/* Progress bar */}
                    <div className="flex-1 space-y-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isComplete ? "bg-green-500" :
                            hasGap ? "bg-amber-400" :
                            "bg-blue-400"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      {/* Entry pills */}
                      {day.entries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {day.entries.map((e) => (
                            <span
                              key={e.id}
                              className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground"
                            >
                              {e.client_name} · {formatDuration(e.duration_minutes)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hours count + status */}
                    <div className="w-24 text-right shrink-0">
                      <p className="text-sm font-mono font-semibold">
                        {formatDuration(day.totalMinutes)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        meta: {formatDuration(dailyGoal)}
                      </p>
                    </div>

                    {/* Status icon */}
                    <div className="w-6 shrink-0">
                      {day.isFuture ? null :
                       isComplete ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                       hasGap ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                       null
                      }
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
