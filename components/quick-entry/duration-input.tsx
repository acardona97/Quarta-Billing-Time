"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { QUICK_DURATIONS } from "@/lib/constants"
import { formatDuration } from "@/lib/utils/duration"
import { cn } from "@/lib/utils"
import { Clock, Plus, Minus } from "lucide-react"

interface DurationInputProps {
  value: number
  onChange: (minutes: number) => void
}

export function DurationInput({ value, onChange }: DurationInputProps) {
  const hours = Math.floor(value / 60)
  const mins = value % 60

  function setHours(h: number) {
    const clamped = Math.max(0, Math.min(12, h))
    onChange(clamped * 60 + mins)
  }

  function setMins(m: number) {
    const clamped = Math.max(0, Math.min(59, m))
    onChange(hours * 60 + clamped)
  }

  function increment(amount: number) {
    onChange(Math.max(1, Math.min(720, value + amount)))
  }

  return (
    <div className="space-y-3">
      {/* Quick buttons */}
      <div className="flex gap-1.5">
        {QUICK_DURATIONS.map((d) => (
          <Button
            key={d.minutes}
            type="button"
            variant={value === d.minutes ? "default" : "outline"}
            size="sm"
            className={cn(
              "flex-1 text-xs h-9 cursor-pointer font-medium transition-all",
              value === d.minutes && "shadow-sm scale-[1.02]"
            )}
            onClick={() => onChange(d.minutes)}
          >
            {d.label}
          </Button>
        ))}
      </div>

      {/* Hours : Minutes input — more intuitive */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onClick={() => increment(-15)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <div className="flex items-center gap-1 px-1">
            <Input
              type="number"
              min={0}
              max={12}
              value={hours}
              onChange={(e) => setHours(parseInt(e.target.value) || 0)}
              className="h-8 w-12 text-center font-mono text-sm tabular-nums border-0 bg-transparent p-0"
            />
            <span className="text-xs text-muted-foreground font-medium">h</span>
            <Input
              type="number"
              min={0}
              max={59}
              value={mins}
              onChange={(e) => setMins(parseInt(e.target.value) || 0)}
              className="h-8 w-12 text-center font-mono text-sm tabular-nums border-0 bg-transparent p-0"
            />
            <span className="text-xs text-muted-foreground font-medium">min</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer"
            onClick={() => increment(15)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-medium text-foreground tabular-nums">{formatDuration(value)}</span>
        </div>
      </div>
    </div>
  )
}
