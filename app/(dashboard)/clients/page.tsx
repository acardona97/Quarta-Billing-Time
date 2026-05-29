"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDuration } from "@/lib/utils/duration"
import { startOfMonthBogota, todayBogota } from "@/lib/utils/date"
import { toast } from "sonner"
import { Plus, Building2, FolderOpen, Clock, Search, Check, X, Trash2, DollarSign, Hourglass } from "lucide-react"
import type { Client, Matter, BillingType } from "@/lib/types"
import { BILLING_TYPE_SHORT } from "@/lib/types"

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<(Client & { matters: Matter[]; totalMinutes: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [newClientType, setNewClientType] = useState<"hourly" | "fee">("hourly")
  const [newClientCap, setNewClientCap] = useState("")

  useEffect(() => {
    loadClients()

    // Reload when user returns to this tab/page (after creating entries elsewhere)
    function handleVisibility() {
      if (document.visibilityState === "visible") loadClients()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    // Reload when a time entry is created (from Quick Entry modal)
    window.addEventListener("time-entry-created", loadClients)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("time-entry-created", loadClients)
    }
  }, [])

  async function loadClients() {
    setLoading(true)

    // Get current user's auth ID
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setLoading(false); return }

    // Only load MY assigned clients (not all — even admins see only their own here)
    const { data: assignments } = await supabase
      .from("user_client_assignments")
      .select("client_id")
      .eq("user_id", authUser.id)
      .eq("is_active", true)

    const myClientIds = (assignments || []).map((a) => a.client_id)

    if (myClientIds.length === 0) {
      setClients([])
      setLoading(false)
      return
    }

    const { data: clientsData } = await supabase
      .from("clients")
      .select(`*, matters(*)`)
      .in("id", myClientIds)
      .eq("is_active", true)
      .order("name")

    if (clientsData) {
      // Filter entries by current month — ONLY MY entries (not other attorneys')
      const monthStart = startOfMonthBogota()
      const { data: hours } = await supabase
        .from("time_entries")
        .select("client_id, duration_minutes")
        .eq("user_id", authUser.id)
        .in("client_id", myClientIds)
        .gte("entry_date", monthStart)

      const hoursByClient = (hours || []).reduce((acc, h) => {
        acc[h.client_id] = (acc[h.client_id] || 0) + h.duration_minutes
        return acc
      }, {} as Record<string, number>)

      setClients(
        clientsData.map((c: any) => ({
          ...c,
          matters: c.matters || [],
          totalMinutes: hoursByClient[c.id] || 0,
        }))
      )
    }
    setLoading(false)
  }

  async function handleCreateClient() {
    if (!newClientName.trim()) {
      toast.error("Nombre requerido")
      return
    }

    if (newClientType === "fee" && !newClientCap) {
      toast.error("Indica el cap de horas para el paquete/fee")
      return
    }

    const { data: { user: currentUser } } = await supabase.auth.getUser()

    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        name: newClientName.trim(),
        billing_type: newClientType,
        monthly_hour_cap: newClientType === "fee" ? parseInt(newClientCap) * 60 : null,
        created_by: currentUser?.id || null,
      })
      .select()
      .single()

    if (error) {
      toast.error("Error creando cliente: " + error.message)
      return
    }

    if (currentUser) {
      await supabase.from("user_client_assignments").insert({
        user_id: currentUser.id,
        client_id: client.id,
        is_active: true,
      })
    }

    // Default "General" matter — no hours allocated yet, inherits client type
    await supabase.from("matters").insert({
      client_id: client.id,
      name: "General",
      is_default: true,
      billing_type: newClientType,
    })

    toast.success(`Cliente "${newClientName}" creado`)
    setNewClientName("")
    setNewClientType("hourly")
    setNewClientCap("")
    setNewClientOpen(false)
    loadClients()
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {clients.length} clientes activos
          </p>
        </div>

        <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
          <DialogTrigger render={<Button size="sm" className="cursor-pointer" />}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo Cliente
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</Label>
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Nombre del cliente"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Modalidad</Label>
                <Select value={newClientType} onValueChange={(v) => setNewClientType((v ?? "hourly") as "hourly" | "fee")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fee">Paquete de horas / Fee mensual</SelectItem>
                    <SelectItem value="hourly">Cobro por horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newClientType === "fee" && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Cap total de horas (mes/paquete)
                  </Label>
                  <Input
                    type="number"
                    value={newClientCap}
                    onChange={(e) => setNewClientCap(e.target.value)}
                    placeholder="Ej: 20"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Total de horas incluidas en el fee o paquete del cliente
                  </p>
                </div>
              )}

              <Button onClick={handleCreateClient} className="w-full cursor-pointer">
                Crear Cliente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="pl-9 h-9"
        />
      </div>

      {/* Client cards */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin clientes</p>
          <p className="text-xs">Crea tu primer cliente con el boton arriba</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <ClientCard key={client.id} client={client} onRefresh={loadClients} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── CLIENT CARD ──────────────────────────────────────────

function ClientCard({
  client,
  onRefresh,
}: {
  client: Client & { matters: Matter[]; totalMinutes: number }
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [showAddMatter, setShowAddMatter] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // New matter form state
  const [matterName, setMatterName] = useState("")
  const [matterDesc, setMatterDesc] = useState("")
  const [matterHours, setMatterHours] = useState("")
  const [matterRate, setMatterRate] = useState("")
  const [matterFee, setMatterFee] = useState("")
  const [matterType, setMatterType] = useState<BillingType>(
    client.billing_type === "fee" ? "fee" : "hourly"
  )

  const isFeeClient = client.billing_type === "fee"
  const capMinutes = client.monthly_hour_cap || 0
  const capPercent = capMinutes > 0 ? Math.min((client.totalMinutes / capMinutes) * 100, 100) : 0

  // Sum allocated hours across matters
  const totalAllocated = client.matters.reduce((sum, m) => sum + (m.allocated_hours || 0), 0)

  function resetMatterForm() {
    setMatterName("")
    setMatterDesc("")
    setMatterHours("")
    setMatterRate("")
    setMatterFee("")
    setMatterType(isFeeClient ? "fee" : "hourly")
    setShowAddMatter(false)
  }

  async function addMatter() {
    if (!matterName.trim()) {
      toast.error("Nombre del asunto requerido")
      return
    }

    const hours = matterHours ? parseFloat(matterHours) : 0
    const durationMinutes = Math.round(hours * 60)

    const insertData: Record<string, unknown> = {
      client_id: client.id,
      name: matterName.trim(),
      description: matterDesc.trim() || null,
      is_default: false,
      billing_type: matterType,
      allocated_hours: hours || null,
    }

    // Cobro por horas: add hourly rate
    if (matterType === "hourly" && matterRate) {
      insertData.hourly_rate = parseFloat(matterRate)
    }

    // Proyecto: add fixed fee
    if (matterType === "project" && matterFee) {
      insertData.fixed_fee = parseFloat(matterFee)
    }

    const { data: newMatter, error } = await supabase
      .from("matters")
      .insert(insertData)
      .select()
      .single()

    if (error) {
      toast.error("Error creando asunto: " + error.message)
      return
    }

    // If hours assigned → create time_entry automatically (hours = work already done)
    if (durationMinutes > 0 && newMatter) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { error: entryErr } = await supabase.from("time_entries").insert({
          user_id: user.id,
          client_id: client.id,
          matter_id: newMatter.id,
          entry_date: todayBogota(),
          duration_minutes: durationMinutes,
          description: `${matterName.trim()}${matterDesc.trim() ? " — " + matterDesc.trim() : ""}`,
          category: null,
          is_billable: true,
          source: "manual",
          billing_status: "draft",
          created_by: user.id,
          applied_rate: matterType === "hourly" && matterRate ? parseFloat(matterRate) : null,
        })

        if (entryErr) {
          toast.error("Asunto creado pero error registrando horas: " + entryErr.message)
        } else {
          toast.success(`Asunto creado — ${formatDuration(durationMinutes)} registradas`)
          // Notify entries page, dashboard, etc.
          window.dispatchEvent(new CustomEvent("time-entry-created"))
        }
      }
    } else {
      toast.success("Asunto creado")
    }

    resetMatterForm()
    onRefresh()
  }

  async function handleDelete() {
    // Delete all FK references that don't have ON DELETE CASCADE
    await supabase.from("timer_sessions").delete().eq("client_id", client.id)
    await supabase.from("suggested_captures").delete().in(
      "suggested_client_id", [client.id]
    )
    await supabase.from("activity_signals").delete().eq("matched_client_id", client.id)
    // These have ON DELETE CASCADE but delete explicitly to avoid RLS issues
    await supabase.from("time_entries").delete().eq("client_id", client.id)
    await supabase.from("matters").delete().eq("client_id", client.id)
    await supabase.from("client_contacts").delete().eq("client_id", client.id)
    await supabase.from("client_billing_profiles").delete().eq("client_id", client.id)
    await supabase.from("client_default_rates").delete().eq("client_id", client.id)
    await supabase.from("user_client_assignments").delete().eq("client_id", client.id)
    const { error } = await supabase.from("clients").delete().eq("id", client.id)

    if (error) {
      toast.error("Error eliminando: " + error.message)
    } else {
      toast.success(`"${client.name}" eliminado`)
      onRefresh()
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">{client.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={isFeeClient ? "default" : "secondary"} className="text-[10px]">
              {isFeeClient ? "Paquete" : "Por horas"}
            </Badge>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2 cursor-pointer" onClick={handleDelete}>
                  Eliminar
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 cursor-pointer" onClick={() => setConfirmDelete(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-red-500 cursor-pointer"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(client.totalMinutes)} registradas
          </span>
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {client.matters.length} asuntos
          </span>
        </div>

        {/* Fee/paquete: cap progress bar at CLIENT level */}
        {isFeeClient && capMinutes > 0 && (
          <div className="space-y-1 p-2 rounded-md bg-muted/40">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground font-medium">Cap del paquete</span>
              <span className="font-semibold">{formatDuration(client.totalMinutes)} / {formatDuration(capMinutes)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capPercent >= 100 ? "bg-red-500" :
                  capPercent >= 80 ? "bg-amber-500" :
                  "bg-green-500"
                }`}
                style={{ width: `${capPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{Math.round(capPercent)}% consumido</span>
              {totalAllocated > 0 && (
                <span>{totalAllocated}h asignadas de {Math.round(capMinutes / 60)}h</span>
              )}
            </div>
          </div>
        )}

        {/* Matters list */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Asuntos</p>
          <div className="space-y-1.5">
            {client.matters.map((m) => (
              <MatterRow key={m.id} matter={m} clientBillingType={client.billing_type} />
            ))}
          </div>
        </div>

        {/* Add matter form */}
        {showAddMatter ? (
          <AddMatterForm
            clientBillingType={client.billing_type}
            matterName={matterName}
            setMatterName={setMatterName}
            matterDesc={matterDesc}
            setMatterDesc={setMatterDesc}
            matterType={matterType}
            setMatterType={setMatterType}
            matterHours={matterHours}
            setMatterHours={setMatterHours}
            matterRate={matterRate}
            setMatterRate={setMatterRate}
            matterFee={matterFee}
            setMatterFee={setMatterFee}
            onSubmit={addMatter}
            onCancel={resetMatterForm}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs w-full cursor-pointer"
            onClick={() => setShowAddMatter(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Agregar asunto
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── MATTER ROW ───────────────────────────────────────────

function MatterRow({ matter, clientBillingType }: { matter: Matter; clientBillingType: string }) {
  const bt = matter.billing_type || clientBillingType || "hourly"

  return (
    <div className="flex items-center justify-between gap-2 py-1 px-2 rounded bg-muted/30 text-xs">
      <div className="min-w-0 flex-1">
        <span className="font-medium truncate block">{matter.name}</span>
        {matter.description && (
          <span className="text-[10px] text-muted-foreground truncate block">{matter.description}</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Hours allocated */}
        {matter.allocated_hours != null && matter.allocated_hours > 0 && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
            <Hourglass className="h-2.5 w-2.5" />
            {matter.allocated_hours}h
          </Badge>
        )}

        {/* Hourly rate (pospago only) */}
        {bt === "hourly" && matter.hourly_rate != null && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
            <DollarSign className="h-2.5 w-2.5" />
            ${new Intl.NumberFormat("es-CO").format(matter.hourly_rate)}/h
          </Badge>
        )}

        {/* Fixed fee (project only) */}
        {bt === "project" && matter.fixed_fee != null && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
            <DollarSign className="h-2.5 w-2.5" />
            ${new Intl.NumberFormat("es-CO").format(matter.fixed_fee)}
          </Badge>
        )}

        {/* Billing type badge */}
        <Badge
          variant={bt === "fee" ? "default" : bt === "project" ? "outline" : "secondary"}
          className="text-[9px] px-1.5 py-0"
        >
          {BILLING_TYPE_SHORT[bt as BillingType] || "Por horas"}
        </Badge>
      </div>
    </div>
  )
}

// ─── ADD MATTER FORM ──────────────────────────────────────

function AddMatterForm({
  clientBillingType,
  matterName, setMatterName,
  matterDesc, setMatterDesc,
  matterType, setMatterType,
  matterHours, setMatterHours,
  matterRate, setMatterRate,
  matterFee, setMatterFee,
  onSubmit,
  onCancel,
}: {
  clientBillingType: string
  matterName: string; setMatterName: (v: string) => void
  matterDesc: string; setMatterDesc: (v: string) => void
  matterType: BillingType; setMatterType: (v: BillingType) => void
  matterHours: string; setMatterHours: (v: string) => void
  matterRate: string; setMatterRate: (v: string) => void
  matterFee: string; setMatterFee: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-2.5 p-3 rounded-md bg-muted/50 border border-border">
      <p className="text-xs font-semibold">Nuevo asunto</p>

      {/* Name */}
      <Input
        value={matterName}
        onChange={(e) => setMatterName(e.target.value)}
        placeholder="Nombre del asunto"
        className="h-8 text-xs"
        autoFocus
      />

      {/* Description */}
      <Textarea
        value={matterDesc}
        onChange={(e) => setMatterDesc(e.target.value)}
        placeholder="Descripcion del asunto (opcional)"
        className="text-xs resize-none"
        rows={2}
      />

      {/* Billing type selector — show all 3 options regardless of client type */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Modalidad del asunto
        </Label>
        <Select value={matterType} onValueChange={(v) => setMatterType((v ?? "hourly") as BillingType)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fee">Paquete (del cap del cliente)</SelectItem>
            <SelectItem value="hourly">Cobro por horas</SelectItem>
            <SelectItem value="project">Proyecto / Tarifa fija</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Hours allocated — ALL billing types */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Horas destinadas al asunto
        </Label>
        <Input
          type="number"
          step="0.5"
          value={matterHours}
          onChange={(e) => setMatterHours(e.target.value)}
          placeholder="Ej: 10"
          className="h-8 text-xs"
        />
        {matterType === "fee" && clientBillingType === "fee" && (
          <p className="text-[10px] text-muted-foreground">
            Del pool de horas del paquete del cliente
          </p>
        )}
      </div>

      {/* Hourly rate — only for pospago */}
      {matterType === "hourly" && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Valor hora (COP)
          </Label>
          <Input
            type="number"
            value={matterRate}
            onChange={(e) => setMatterRate(e.target.value)}
            placeholder="Ej: 350000"
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Fixed fee — only for project */}
      {matterType === "project" && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Tarifa fija del servicio (COP)
          </Label>
          <Input
            type="number"
            value={matterFee}
            onChange={(e) => setMatterFee(e.target.value)}
            placeholder="Ej: 5000000"
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5 pt-1">
        <Button size="sm" className="h-7 text-xs flex-1 cursor-pointer" onClick={onSubmit}>
          <Check className="h-3 w-3 mr-1" />
          Crear asunto
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
