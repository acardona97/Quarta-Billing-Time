"use client"

import { createContext, useContext } from "react"
import type { TimerSession } from "@/lib/types"

interface QuickEntryContextType {
  openQuickEntry: (prefill?: {
    clientId?: string
    matterId?: string
    durationMinutes?: number
    realSeconds?: number
    description?: string
    category?: string
    source?: string
  }) => void
  openFromTimer: (timer: TimerSession) => void
}

const QuickEntryContext = createContext<QuickEntryContextType>({
  openQuickEntry: () => {},
  openFromTimer: () => {},
})

export const QuickEntryProvider = QuickEntryContext.Provider
export const useQuickEntry = () => useContext(QuickEntryContext)
