"use client"

import type { DashboardStats, TimeEntryWithRelations, TimerSessionWithRelations } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDuration } from "@/lib/utils/duration"
import { formatDateBogota } from "@/lib/utils/date"
import { Clock, Flame, TrendingUp, Target, Timer, FileText, ChevronRight, Zap } from "lucide-react"
import Link from "next/link"

interface DashboardContentProps {
  stats: DashboardStats
  recentEntries: TimeEntryWithRelations[]
  activeTimers: TimerSessionWithRelations[]
}

export function DashboardContent({ stats, recentEntries, activeTimers }: DashboardContentProps) {
  const dailyProgress = Math.min((stats.today_minutes / stats.daily_goal) * 100, 100)
  const goalReached = stats.today_minutes >= stats.daily_goal

  return (
    <div className="space-y-6">
      {/* Daily Progress — hero card */}
      <Card className="relative overflow-hidden border-0 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.20_0.027_256)] to-[oklch(0.28_0.040_256)]" />
        <CardContent className="relative p-6 text-white">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-sm text-white/60 font-medium">Progreso del dia</p>
              <p className="text-4xl font-bold mt-1 tabular-nums tracking-tight">
                {formatDuration(stats.today_minutes)}
              </p>
              <p className="text-xs text-white/40 mt-1">
                Meta diaria: {formatDuration(stats.daily_goal)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {stats.streak_current > 0 && (
                <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <Flame className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-bold">{stats.streak_current}</span>
                  <span className="text-[10px] text-white/50">dias</span>
                </div>
              )}
              {goalReached && (
                <div className="h-11 w-11 rounded-full bg-emerald-500/20 backdrop-blur-sm flex items-center justify-center">
                  <Zap className="h-5 w-5 text-emerald-400 fill-emerald-400" />
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${
                goalReached
                  ? "bg-gradient-to-r from-emerald-400 to-emerald-300"
                  : "bg-gradient-to-r from-amber-400/90 to-amber-300"
              }`}
              style={{ width: `${dailyProgress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[11px] text-white/40">
              {goalReached
                ? "Meta alcanzada — buen trabajo"
                : `Faltan ${formatDuration(Math.max(0, stats.daily_goal - stats.today_minutes))}`}
            </p>
            <p className="text-[11px] text-white/40 tabular-nums">{Math.round(dailyProgress)}%</p>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Semana"
          value={formatDuration(stats.week_minutes)}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-50 dark:bg-blue-950/30"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Mes"
          value={formatDuration(stats.month_minutes)}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Facturable"
          value={`${stats.billable_ratio}%`}
          color="text-amber-600 dark:text-amber-400"
          bgColor="bg-amber-50 dark:bg-amber-950/30"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active timers */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4 text-emerald-600" />
                Cronometros activos
              </CardTitle>
              <Link href="/timers">
                <Button variant="ghost" size="sm" className="h-7 text-xs cursor-pointer">
                  Ver todos <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeTimers.length === 0 ? (
              <div className="text-center py-8">
                <Timer className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin cronometros activos</p>
                <Link href="/timers">
                  <Button variant="outline" size="sm" className="mt-3 text-xs cursor-pointer">
                    Iniciar cronometro
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {activeTimers.map((timer) => (
                  <div key={timer.id} className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {timer.client?.name || "Sin cliente"}
                      </p>
                      {timer.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{timer.description}</p>
                      )}
                    </div>
                    <span className="text-xs font-mono font-semibold tabular-nums shrink-0">
                      {formatDuration(Math.floor(timer.accumulated_seconds / 60))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent entries */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Entradas recientes
              </CardTitle>
              <Link href="/entries">
                <Button variant="ghost" size="sm" className="h-7 text-xs cursor-pointer">
                  Ver todas <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin entradas aun</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Ctrl+Shift+T</kbd> para registrar
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${entry.is_billable ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {entry.client?.name || "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {entry.description || entry.matter?.name || "Sin descripcion"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-semibold tabular-nums">
                        {formatDuration(entry.duration_minutes)}
                      </span>
                      <p className="text-[9px] text-muted-foreground">
                        {formatDateBogota(entry.entry_date)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="text-center pb-2">
        <p className="text-xs text-muted-foreground/60">
          <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">Ctrl+Shift+T</kbd>
          {" "}Registro rapido
          <span className="mx-2.5 text-muted-foreground/20">|</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">Ctrl+Shift+S</kbd>
          {" "}Nuevo cronometro
        </p>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  bgColor: string
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bgColor} ${color} mb-2.5`}>
          {icon}
        </div>
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
      </CardContent>
    </Card>
  )
}
