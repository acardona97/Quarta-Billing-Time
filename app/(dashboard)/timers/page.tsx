"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useTimers, formatTimerDisplay } from "@/lib/hooks/use-timer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClientSelector } from "@/components/quick-entry/client-selector"
import { MatterSelector } from "@/components/quick-entry/matter-selector"
import { roundToBillingIncrement, formatDuration } from "@/lib/utils/duration"
import { CATEGORIES } from "@/lib/constants"
import { toast } from "sonner"
import { Play, Pause, Square, Plus, Timer, Receipt, Trash2, Building2, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Client, Matter } from "@/lib/types"
import { useQuickEntry } from "@/lib/context/quick-entry-context"

export default function TimersPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [matters, setMatters] = useState<Record<string, Matter[]>>({})

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("is_active", true)
        .order("name")
      if (data) setClients(data)
    }
    init()
  }, [])

  async function loadMattersForClient(clientId: string) {
    if (matters[clientId]) return matters[clientId]
    const { data } = await supabase
      .from("matters")
      .select("*")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
    const result = data || []
    setMatters((prev) => ({ ...prev, [clientId]: result }))
    return result
  }

  if (!userId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      </div>
    )
  }

  return (
    <TimersContent
      userId={userId}
      clients={clients}
      mattersMap={matters}
      loadMatters={loadMattersForClient}
    />
  )
}

function TimersContent({
  userId,
  clients,
  mattersMap,
  loadMatters,
}: {
  userId: string
  clients: Client[]
  mattersMap: Record<string, Matter[]>
  loadMatters: (clientId: string) => Promise<Matter[]>
}) {
  const { timers, startTimer, pauseTimer, resumeTimer, stopTimer, deleteTimer, getDisplaySeconds } = useTimers(userId)
  const { openFromTimer } = useQuickEntry()
  const [newDescription, setNewDescription] = useState("")
  const [newClientId, setNewClientId] = useState<string | null>(null)
  const [newMatterId, setNewMatterId] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [clientMatters, setClientMatters] = useState<Matter[]>([])

  async function handleClientChange(clientId: string | null) {
    setNewClientId(clientId)
    setNewMatterId(null)
    if (clientId) {
      const m = await loadMatters(clientId)
      setClientMatters(m)
      if (m.length === 1) setNewMatterId(m[0].id)
    } else {
      setClientMatters([])
    }
  }

  async function handleStart() {
    if (!newClientId) {
      toast.error("Selecciona un cliente")
      return
    }
    if (!newMatterId && clientMatters.length > 1) {
      toast.error("Selecciona un asunto")
      return
    }

    await startTimer({
      clientId: newClientId,
      matterId: newMatterId || clientMatters[0]?.id || undefined,
      description: newDescription || undefined,
      category: newCategory || undefined,
    })
    setNewDescription("")
    setNewCategory(null)
    toast.success("Cronometro iniciado")
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Timer className="h-6 w-6 text-primary" />
            Cronometros
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {timers.length} activos
          </p>
        </div>
      </div>

      {/* Start new timer — with client/matter/category */}
      <Card className="border-primary/20">
        <CardContent className="py-4 px-5 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nuevo cronometro
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Client selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Cliente <span className="text-destructive">*</span>
              </Label>
              <ClientSelector
                clients={clients}
                value={newClientId}
                onChange={(id) => handleClientChange(id)}
              />
            </div>

            {/* Matter selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Asunto
              </Label>
              {clientMatters.length <= 1 ? (
                <div className="h-9 flex items-center px-3 text-sm text-muted-foreground border rounded-lg bg-muted/30">
                  {clientMatters[0]?.name || "Sin asuntos"}
                </div>
              ) : (
                <MatterSelector
                  matters={clientMatters}
                  value={newMatterId}
                  onChange={setNewMatterId}
                />
              )}
            </div>
          </div>

          {/* Category chips */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Tipo de actividad <span className="text-muted-foreground/60">(opcional)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <Badge
                  key={cat.value}
                  variant={newCategory === cat.value ? "default" : "outline"}
                  className="cursor-pointer transition-colors hover:bg-primary/10 text-xs"
                  onClick={() => setNewCategory(newCategory === cat.value ? null : cat.value)}
                >
                  {cat.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Description + Start */}
          <div className="flex items-center gap-3">
            <Input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Descripcion — Ej: Revision contrato de arrendamiento..."
              className="flex-1 h-9"
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
            />
            <Button onClick={handleStart} className="cursor-pointer shrink-0 h-9">
              <Play className="h-4 w-4 mr-1.5" />
              Iniciar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active timers */}
      {timers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Timer className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin cronometros activos</p>
          <p className="text-xs">Selecciona cliente y actividad arriba para iniciar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timers.map((timer) => {
            const seconds = getDisplaySeconds(timer)
            const isRunning = timer.is_running && !timer.paused_at
            const isPaused = timer.is_running && !!timer.paused_at
            const billingMins = roundToBillingIncrement(seconds / 60)
            const clientName = clients.find((c) => c.id === timer.client_id)?.name
            const matterName = mattersMap[timer.client_id || ""]?.find((m) => m.id === timer.matter_id)?.name

            return (
              <Card
                key={timer.id}
                className={cn(
                  "transition-colors",
                  isRunning && "border-green-200 bg-green-50/30",
                  isPaused && "border-amber-200 bg-amber-50/30"
                )}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4">
                    {/* Status indicator */}
                    <div className={cn(
                      "h-3 w-3 rounded-full shrink-0",
                      isRunning && "bg-green-500 animate-pulse",
                      isPaused && "bg-amber-500"
                    )} />

                    {/* Timer display */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-mono font-bold tabular-nums">
                          {formatTimerDisplay(seconds)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {isRunning ? "Corriendo" : "Pausado"}
                        </Badge>
                      </div>
                      {/* Client + matter + category info */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {clientName && (
                          <span className="text-xs flex items-center gap-1 text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {clientName}
                          </span>
                        )}
                        {matterName && (
                          <span className="text-xs flex items-center gap-1 text-muted-foreground">
                            <FolderOpen className="h-3 w-3" />
                            {matterName}
                          </span>
                        )}
                        {timer.category && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {timer.category}
                          </Badge>
                        )}
                      </div>
                      {timer.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {timer.description}
                        </p>
                      )}
                    </div>

                    {/* Billing indicator */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Receipt className="h-3 w-3" />
                        <span>Factura:</span>
                      </div>
                      <p className="text-sm font-mono font-semibold">
                        {formatDuration(billingMins)}
                      </p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isRunning ? (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 cursor-pointer"
                          onClick={() => pauseTimer(timer.id)}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 cursor-pointer"
                          onClick={() => resumeTimer(timer.id)}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="icon"
                        className="h-9 w-9 cursor-pointer"
                        onClick={async () => {
                          const stopped = await stopTimer(timer.id)
                          if (stopped) openFromTimer(stopped)
                        }}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 cursor-pointer text-muted-foreground hover:text-red-500"
                        onClick={() => deleteTimer(timer.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Billing rules info */}
      <Card className="bg-muted/30">
        <CardContent className="py-3 px-4">
          <p className="text-xs font-medium mb-1">Regla de facturacion (taximetro)</p>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
            <span>0-15 min = 15 min</span>
            <span>15-30 min = 30 min</span>
            <span>&gt;30 min = 1 hora</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Patron se repite por cada hora adicional
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
