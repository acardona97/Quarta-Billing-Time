"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { TimerSession } from "@/lib/types"
import { TIMER_SYNC_INTERVAL_MS } from "@/lib/constants"

export function useTimers(userId: string) {
  const supabase = createClient()
  const [timers, setTimers] = useState<TimerSession[]>([])
  const [tick, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timersRef = useRef<TimerSession[]>(timers)

  // Keep ref in sync with state for interval callbacks
  useEffect(() => { timersRef.current = timers }, [timers])

  useEffect(() => {
    loadTimers()

    intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000)

    syncRef.current = setInterval(syncRunning, TIMER_SYNC_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (syncRef.current) clearInterval(syncRef.current)
    }
  }, [userId])

  async function loadTimers() {
    const { data } = await supabase
      .from("timer_sessions")
      .select("*")
      .eq("user_id", userId)
      .or("is_running.eq.true,paused_at.not.is.null")
      .order("started_at", { ascending: false })

    if (data) setTimers(data)
  }

  async function syncRunning() {
    const running = timersRef.current.filter((t) => t.is_running && !t.paused_at)
    for (const timer of running) {
      const elapsed = getElapsedSeconds(timer)
      await supabase
        .from("timer_sessions")
        .update({ accumulated_seconds: elapsed })
        .eq("id", timer.id)
    }
  }

  function getElapsedSeconds(timer: TimerSession): number {
    if (!timer.is_running) return timer.accumulated_seconds
    if (timer.paused_at) return timer.accumulated_seconds

    // accumulated_seconds = all time from previous start/pause cycles
    // started_at = timestamp of last resume (reset on each resume)
    // total = accumulated + time since last resume
    const sinceResume = Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000)
    return timer.accumulated_seconds + sinceResume
  }

  const getDisplaySeconds = useCallback((timer: TimerSession): number => {
    if (!timer.is_running) return timer.accumulated_seconds
    if (timer.paused_at) return timer.accumulated_seconds

    // Same formula as getElapsedSeconds: accumulated + time since last resume
    const sinceResume = Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000)
    return timer.accumulated_seconds + sinceResume
  }, [tick])

  const startTimer = useCallback(async (opts?: {
    clientId?: string
    matterId?: string
    description?: string
    category?: string
  }) => {
    const { data, error } = await supabase
      .from("timer_sessions")
      .insert({
        user_id: userId,
        client_id: opts?.clientId || null,
        matter_id: opts?.matterId || null,
        description: opts?.description || null,
        category: opts?.category || null,
        is_running: true,
        accumulated_seconds: 0,
      })
      .select()
      .single()

    if (data) setTimers((prev) => [data, ...prev])
    return data
  }, [userId])

  const pauseTimer = useCallback(async (timerId: string) => {
    const timer = timers.find((t) => t.id === timerId)
    if (!timer || !timer.is_running || timer.paused_at) return

    // Total = previous accumulated + current running session
    const sinceResume = Math.floor(
      (Date.now() - new Date(timer.started_at).getTime()) / 1000
    )
    const totalSeconds = timer.accumulated_seconds + sinceResume

    await supabase
      .from("timer_sessions")
      .update({
        paused_at: new Date().toISOString(),
        accumulated_seconds: totalSeconds,
      })
      .eq("id", timerId)

    setTimers((prev) =>
      prev.map((t) =>
        t.id === timerId
          ? { ...t, paused_at: new Date().toISOString(), accumulated_seconds: totalSeconds }
          : t
      )
    )
  }, [timers])

  const resumeTimer = useCallback(async (timerId: string) => {
    const timer = timers.find((t) => t.id === timerId)
    if (!timer || !timer.paused_at) return

    await supabase
      .from("timer_sessions")
      .update({
        paused_at: null,
        started_at: new Date().toISOString(),
      })
      .eq("id", timerId)

    setTimers((prev) =>
      prev.map((t) =>
        t.id === timerId
          ? { ...t, paused_at: null, started_at: new Date().toISOString() }
          : t
      )
    )
  }, [timers])

  const stopTimer = useCallback(async (timerId: string): Promise<TimerSession | null> => {
    const timer = timers.find((t) => t.id === timerId)
    if (!timer) return null

    let finalSeconds = timer.accumulated_seconds
    if (timer.is_running && !timer.paused_at) {
      // accumulated + current running session
      const sinceResume = Math.floor(
        (Date.now() - new Date(timer.started_at).getTime()) / 1000
      )
      finalSeconds = timer.accumulated_seconds + sinceResume
    }

    await supabase
      .from("timer_sessions")
      .update({
        is_running: false,
        paused_at: null,
        accumulated_seconds: finalSeconds,
      })
      .eq("id", timerId)

    const stopped = { ...timer, is_running: false, paused_at: null, accumulated_seconds: finalSeconds }
    setTimers((prev) => prev.filter((t) => t.id !== timerId))

    return stopped
  }, [timers])

  const deleteTimer = useCallback(async (timerId: string) => {
    await supabase.from("timer_sessions").delete().eq("id", timerId)
    setTimers((prev) => prev.filter((t) => t.id !== timerId))
  }, [])

  return {
    timers,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    deleteTimer,
    getDisplaySeconds,
    reload: loadTimers,
  }
}

export function formatTimerDisplay(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}
