"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ClientSelector } from "./client-selector"
import { MatterSelector } from "./matter-selector"
import { DurationInput } from "./duration-input"
import { CATEGORIES } from "@/lib/constants"
import { resolveRate } from "@/lib/utils/rate-resolver"
import { todayBogota } from "@/lib/utils/date"
import { formatDuration, roundToBillingIncrement } from "@/lib/utils/duration"
import { toast } from "sonner"
import { Loader2, Clock, Receipt, Users } from "lucide-react"
import type { Client, Matter, MatterRateOverride, ClientDefaultRate } from "@/lib/types"

interface Attorney {
  id: string
  full_name: string
}

interface QuickEntryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  prefillData?: {
    clientId?: string
    matterId?: string
    durationMinutes?: number
    realSeconds?: number // Raw timer seconds (for showing real vs billed)
    description?: string
    category?: string
    source?: string
  }
}

export function QuickEntryModal({
  open,
  onOpenChange,
  userId,
  prefillData,
}: QuickEntryModalProps) {
  const supabase = createClient()

  const [clientId, setClientId] = useState<string | null>(prefillData?.clientId || null)
  const [matterId, setMatterId] = useState<string | null>(prefillData?.matterId || null)
  const [durationMinutes, setDurationMinutes] = useState(prefillData?.durationMinutes || 30)
  const [description, setDescription] = useState(prefillData?.description || "")
  const [category, setCategory] = useState<string | null>(prefillData?.category || null)
  const [isBillable, setIsBillable] = useState(true)
  const [rate, setRate] = useState<number | null>(null)
  const [entryDate, setEntryDate] = useState(todayBogota())
  const [loading, setLoading] = useState(false)

  const [clients, setClients] = useState<Client[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [matterRates, setMatterRates] = useState<MatterRateOverride[]>([])
  const [clientRates, setClientRates] = useState<ClientDefaultRate[]>([])

  // Shared task — opt-in, off by default. Does not affect the normal flow.
  const [isShared, setIsShared] = useState(false)
  const [attorneys, setAttorneys] = useState<Attorney[]>([])
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([])

  // Sync prefillData when modal opens
  useEffect(() => {
    if (!open) return
    if (prefillData) {
      if (prefillData.clientId) setClientId(prefillData.clientId)
      if (prefillData.matterId) setMatterId(prefillData.matterId)
      if (prefillData.durationMinutes) setDurationMinutes(prefillData.durationMinutes)
      if (prefillData.description) setDescription(prefillData.description)
      if (prefillData.category) setCategory(prefillData.category)
    }
    loadClients()
    loadAttorneys()
  }, [open, prefillData])

  async function loadAttorneys() {
    const { data } = await supabase.rpc("list_attorneys")
    if (data) setAttorneys(data.filter((a: Attorney) => a.id !== userId))
  }

  useEffect(() => {
    if (clientId) loadMatters(clientId)
  }, [clientId])

  useEffect(() => {
    if (matterId) {
      const resolved = resolveRate({
        matterOverrides: matterRates,
        clientDefaults: clientRates,
      })
      setRate(resolved)
      // Hereda facturable del asunto (el usuario puede cambiarlo)
      const m = matters.find((mm) => mm.id === matterId)
      if (m && (m as any).is_billable != null) setIsBillable((m as any).is_billable)
    }
  }, [matterId, matterRates, clientRates, matters])

  async function loadClients() {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
    if (data) setClients(data)
  }

  async function loadMatters(cId: string) {
    const { data } = await supabase
      .from("matters")
      .select("*")
      .eq("client_id", cId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })

    if (data) {
      setMatters(data)
      if (data.length === 1) {
        setMatterId(data[0].id)
      } else if (!prefillData?.matterId) {
        setMatterId(data[0]?.id || null)
      }
    }

    const [mRates, cRates] = await Promise.all([
      supabase
        .from("matter_rate_overrides")
        .select("*")
        .in("matter_id", (data || []).map((m) => m.id)),
      supabase
        .from("client_default_rates")
        .select("*")
        .eq("client_id", cId),
    ])

    if (mRates.data) setMatterRates(mRates.data)
    if (cRates.data) setClientRates(cRates.data)
  }

  const handleSubmit = useCallback(async () => {
    if (!clientId || !matterId || durationMinutes <= 0) {
      toast.error("Completa cliente, asunto y duracion")
      return
    }

    if (!description.trim()) {
      toast.error("La descripcion es obligatoria")
      return
    }

    setLoading(true)

    // Shared task opt-in: SECURITY DEFINER RPC inserts one time_entries row
    // per participant AND grants each collaborator standing access to this
    // specific matter — a plain multi-row insert would fail RLS (entries
    // require user_id = auth.uid()) for every row but the creator's own.
    if (isShared && collaboratorIds.length > 0) {
      const { error: rpcError } = await supabase.rpc("create_shared_task", {
        p_client_id: clientId,
        p_matter_id: matterId,
        p_title: description.trim(),
        p_entry_date: entryDate,
        p_duration_minutes: durationMinutes,
        p_description: description || null,
        p_category: category || null,
        p_is_billable: isBillable,
        p_source: prefillData?.source || "manual",
        p_applied_rate: rate,
        p_participant_ids: [userId, ...collaboratorIds],
      })

      setLoading(false)

      if (rpcError) {
        toast.error("Error al registrar tarea compartida: " + rpcError.message)
        return
      }

      toast.success("Tarea compartida registrada", {
        description: `${durationMinutes} min × ${collaboratorIds.length + 1} abogados — ${clients.find((c) => c.id === clientId)?.name}`,
      })

      window.dispatchEvent(new CustomEvent("time-entry-created"))
      resetForm()
      onOpenChange(false)
      return
    }

    const { error } = await supabase.from("time_entries").insert({
      user_id: userId,
      client_id: clientId,
      matter_id: matterId,
      entry_date: entryDate,
      duration_minutes: durationMinutes,
      description: description || null,
      category: category || null,
      is_billable: isBillable,
      source: prefillData?.source || "manual",
      applied_rate: rate,
      billing_status: "draft",
      created_by: userId,
    })

    setLoading(false)

    if (error) {
      toast.error("Error al registrar: " + error.message)
      return
    }

    toast.success("Tiempo registrado", {
      description: `${durationMinutes} min — ${clients.find((c) => c.id === clientId)?.name}`,
    })

    // Notify other components (clients page, dashboard) to reload data
    window.dispatchEvent(new CustomEvent("time-entry-created"))

    resetForm()
    onOpenChange(false)
  }, [clientId, matterId, durationMinutes, description, category, isBillable, rate, entryDate, userId, clients, prefillData, isShared, collaboratorIds])

  function resetForm() {
    setClientId(null)
    setMatterId(null)
    setDurationMinutes(30)
    setDescription("")
    setCategory(null)
    setIsBillable(true)
    setRate(null)
    setEntryDate(todayBogota())
    setIsShared(false)
    setCollaboratorIds([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Registrar tiempo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Client */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Cliente
            </Label>
            <ClientSelector
              clients={clients}
              value={clientId}
              onChange={(id) => {
                setClientId(id)
                setMatterId(null)
              }}
            />
          </div>

          {/* Matter — always show when client selected */}
          {clientId && matters.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Asunto
              </Label>
              {matters.length === 1 ? (
                <div className="h-9 flex items-center px-3 text-sm text-muted-foreground border rounded-lg bg-muted/30">
                  {matters[0].name}
                </div>
              ) : (
                <MatterSelector
                  matters={matters}
                  value={matterId}
                  onChange={setMatterId}
                />
              )}
            </div>
          )}

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Duración
            </Label>
            <DurationInput value={durationMinutes} onChange={setDurationMinutes} />
            {/* Billing rounding indicator — visible when from timer */}
            {prefillData?.source === "timer" && prefillData.realSeconds && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Real: {formatDuration(Math.ceil(prefillData.realSeconds / 60))}</span>
                <span className="text-muted-foreground/40">→</span>
                <Receipt className="h-3 w-3 shrink-0 text-amber-600" />
                <span className="font-medium text-foreground">
                  Facturado: {formatDuration(durationMinutes)}
                </span>
              </div>
            )}
          </div>

          {/* Description — obligatoria */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Descripcion <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Describe brevemente el trabajo realizado..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Category — chips + free text */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Categoria <span className="text-muted-foreground/60">(opcional)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {CATEGORIES.map((cat) => (
                <Badge
                  key={cat.value}
                  variant={category === cat.value ? "default" : "outline"}
                  className="cursor-pointer transition-colors hover:bg-primary/10"
                  onClick={() => setCategory(category === cat.value ? null : cat.value)}
                >
                  {cat.label}
                </Badge>
              ))}
            </div>
            <Input
              value={category && !CATEGORIES.some(c => c.value === category) ? category : ""}
              onChange={(e) => setCategory(e.target.value || null)}
              placeholder="O escribe tu propia categoria..."
              className="h-8 text-xs"
            />
          </div>

          {/* Billable + Rate + Date row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Facturable
              </Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={isBillable}
                  onCheckedChange={setIsBillable}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Tarifa/h
              </Label>
              <Input
                type="number"
                value={rate ?? ""}
                onChange={(e) => setRate(e.target.value ? Number(e.target.value) : null)}
                placeholder="COP"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fecha
              </Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* Shared task — opt-in, collapsed by default */}
          {attorneys.length > 0 && (
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Tarea compartida
                </Label>
                <Switch
                  checked={isShared}
                  onCheckedChange={(v) => {
                    setIsShared(v)
                    if (!v) setCollaboratorIds([])
                  }}
                />
              </div>
              {isShared && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    Cada colaborador registra su propia duración — selecciona quién más participó
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {attorneys.map((a) => {
                      const selected = collaboratorIds.includes(a.id)
                      return (
                        <Badge
                          key={a.id}
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer transition-colors hover:bg-primary/10"
                          onClick={() =>
                            setCollaboratorIds((prev) =>
                              selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                            )
                          }
                        >
                          {a.full_name}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !clientId || !matterId || durationMinutes <= 0}
            className="w-full h-11 font-semibold cursor-pointer"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Registrar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
