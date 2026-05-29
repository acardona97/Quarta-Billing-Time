"use client"

import { useState, useEffect } from "react"
import { useTimers, formatTimerDisplay } from "@/lib/hooks/use-timer"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Play, Pause, Square, Timer, Plus, Receipt, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { roundToBillingIncrement, formatDuration } from "@/lib/utils/duration"
import type { TimerSession } from "@/lib/types"

interface TimerBarProps {
  userId: string
  onStop: (timer: TimerSession) => void
  onStartNew: () => void
}

export function TimerBar({ userId, onStop, onStartNew }: TimerBarProps) {
  const { timers, pauseTimer, resumeTimer, stopTimer, getDisplaySeconds } = useTimers(userId)
  const [clientNames, setClientNames] = useState<Record<string, string>>({})

  // Fetch client names for active timers
  useEffect(() => {
    const clientIds = timers
      .map((t) => t.client_id)
      .filter((id): id is string => !!id && !clientNames[id])

    if (clientIds.length === 0) return

    const supabase = createClient()
    supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds)
      .then(({ data }) => {
        if (data) {
          setClientNames((prev) => {
            const next = { ...prev }
            data.forEach((c) => { next[c.id] = c.name })
            return next
          })
        }
      })
  }, [timers])

  if (timers.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border">
      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {timers.map((timer) => (
          <TimerPill
            key={timer.id}
            timer={timer}
            clientName={timer.client_id ? clientNames[timer.client_id] : undefined}
            displaySeconds={getDisplaySeconds(timer)}
            onPause={() => pauseTimer(timer.id)}
            onResume={() => resumeTimer(timer.id)}
            onStop={async () => {
              const stopped = await stopTimer(timer.id)
              if (stopped) onStop(stopped)
            }}
          />
        ))}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 cursor-pointer"
              onClick={onStartNew}
            />
          }
        >
          <Plus className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent>Nuevo cronometro</TooltipContent>
      </Tooltip>
    </div>
  )
}

function TimerPill({
  timer,
  clientName,
  displaySeconds,
  onPause,
  onResume,
  onStop,
}: {
  timer: TimerSession
  clientName?: string
  displaySeconds: number
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  const isRunning = timer.is_running && !timer.paused_at
  const isPaused = timer.is_running && !!timer.paused_at
  const billingMinutes = roundToBillingIncrement(displaySeconds / 60)

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
      isRunning && "bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]",
      isPaused && "bg-[var(--warning)]/10 border-[var(--warning)]/30 text-[var(--warning)]"
    )}>
      {isRunning && <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}

      {/* Client name */}
      {clientName && (
        <span className="flex items-center gap-0.5 text-[10px] opacity-80 max-w-24 truncate">
          <Building2 className="h-2.5 w-2.5 shrink-0" />
          {clientName}
        </span>
      )}

      <span className="font-mono tabular-nums text-[11px]">
        {formatTimerDisplay(displaySeconds)}
      </span>

      {/* Billing increment indicator (taximetro) */}
      <Tooltip>
        <TooltipTrigger render={<span className="flex items-center gap-0.5 text-[10px] opacity-70 cursor-default" />}>
          <Receipt className="h-2.5 w-2.5" />
          {formatDuration(billingMinutes)}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Se facturara: {formatDuration(billingMinutes)}
        </TooltipContent>
      </Tooltip>

      {timer.description && (
        <span className="max-w-20 truncate text-[10px] opacity-70">
          {timer.description}
        </span>
      )}

      <div className="flex items-center gap-0.5 ml-1">
        {isRunning ? (
          <button onClick={onPause} className="p-0.5 hover:opacity-70 cursor-pointer">
            <Pause className="h-3 w-3" />
          </button>
        ) : (
          <button onClick={onResume} className="p-0.5 hover:opacity-70 cursor-pointer">
            <Play className="h-3 w-3" />
          </button>
        )}
        <button onClick={onStop} className="p-0.5 hover:opacity-70 cursor-pointer">
          <Square className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
