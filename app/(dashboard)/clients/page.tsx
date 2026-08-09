"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { formatDuration } from "@/lib/utils/duration"
import { startOfMonthBogota, todayBogota } from "@/lib/utils/date"
import { toast } from "sonner"
import {
  Plus, Building2, FolderOpen, Clock, Search, Check, X, Trash2,
  DollarSign, Send, Receipt, AlertTriangle, Pencil, Lock, UserPlus,
} from "lucide-react"
import type { Client, Matter, BillingType } from "@/lib/types"
import { BILLING_TYPE_SHORT } from "@/lib/types"

// ─── TYPES ───────────────────────────────────────────────

interface MatterWithHours extends Matter {
  consumedMinutes: number   // total compartido (todos los abogados, este mes)
  myMinutes: number         // aporte propio del abogado (editable)
}

interface ClientWithData extends Client {
  matters: MatterWithHours[]
  totalMinutes: number      // total compartido de todos sus asuntos
  myTotalMinutes: number    // aporte propio
}

// ─── COLORS PER BILLING TYPE ─────────────────────────────

const BILLING_COLORS: Record<string, { bar: string; badge: string }> = {
  fee:     { bar: "bg-blue-400",    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  hourly:  { bar: "bg-emerald-400", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  project: { bar: "bg-amber-400",   badge: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
}

// ─── FEE CAP STATUS (stateless reset: monthly OR on exhaustion) ──

function feeCapStatus(consumedMinutes: number, capMinutes: number | null) {
  if (!capMinutes || capMinutes <= 0) {
    return { hasCap: false, current: consumedMinutes, cap: 0, pct: 0, cycles: 0 }
  }
  const cycles = Math.floor(consumedMinutes / capMinutes)
  const current = consumedMinutes % capMinutes
  const pct = Math.round((current / capMinutes) * 100)
  return { hasCap: true, current, cap: capMinutes, pct, cycles }
}

// ─── MAIN PAGE — 3-Column Layout ─────────────────────────

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<ClientWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<ClientWithData | null>(null)
  const [userRole, setUserRole] = useState<string>("attorney")
  const [userId, setUserId] = useState<string>("")

  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [newClientNit, setNewClientNit] = useState("")
  const [newClientCap, setNewClientCap] = useState("")
  const [newClientIsFirm, setNewClientIsFirm] = useState(false)

  const [editClientOpen, setEditClientOpen] = useState(false)
  const [editClientName, setEditClientName] = useState("")
  const [editClientNit, setEditClientNit] = useState("")
  const [editClientCap, setEditClientCap] = useState("")

  const [shareOpen, setShareOpen] = useState(false)
  const [attorneys, setAttorneys] = useState<{ id: string; full_name: string }[]>([])
  const [shareUserId, setShareUserId] = useState("")

  const [invoiceMatter, setInvoiceMatter] = useState<MatterWithHours | null>(null)

  const isSuperAdmin = userRole === "super_admin"

  function canEditClient(client: ClientWithData | null) {
    if (!client) return false
    return client.is_firm_client ? isSuperAdmin : true
  }

  function openEditClient(client: ClientWithData) {
    setEditClientName(client.name)
    setEditClientNit(client.nit || "")
    setEditClientCap(client.monthly_hour_cap ? (client.monthly_hour_cap / 60).toString() : "")
    setEditClientOpen(true)
  }

  async function handleUpdateClient() {
    if (!selectedClient) return
    if (!editClientName.trim()) { toast.error("Nombre requerido"); return }

    const capHours = parseFloat(editClientCap)
    const hasCap = !isNaN(capHours) && capHours > 0

    const { error } = await supabase
      .from("clients")
      .update({
        name: editClientName.trim(),
        nit: editClientNit.trim() || null,
        monthly_hour_cap: hasCap ? Math.round(capHours * 60) : null,
        billing_type: hasCap ? "fee" : selectedClient.billing_type,
      })
      .eq("id", selectedClient.id)

    if (error) { toast.error("Error: " + error.message); return }
    toast.success("Cliente actualizado")
    setEditClientOpen(false)
    loadClients()
  }

  async function openShare() {
    setShareUserId("")
    const { data } = await supabase.rpc("list_attorneys")
    setAttorneys((data || []).filter((a: any) => a.id !== userId))
    setShareOpen(true)
  }

  async function handleShare() {
    if (!selectedClient || !shareUserId) { toast.error("Elige un abogado"); return }
    const { error } = await supabase.from("user_client_assignments").insert({
      user_id: shareUserId,
      client_id: selectedClient.id,
      is_active: true,
    })
    if (error) { toast.error("Error: " + error.message); return }
    const name = attorneys.find((a) => a.id === shareUserId)?.full_name || "abogado"
    toast.success(`Cliente compartido con ${name}`)
    setShareOpen(false)
  }

  useEffect(() => {
    loadClients()
    supabase.rpc("list_attorneys").then(({ data }) => {
      if (data) setAttorneys(data)
    })

    function handleVisibility() {
      if (document.visibilityState === "visible") loadClients()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("time-entry-created", loadClients)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("time-entry-created", loadClients)
    }
  }, [])

  async function loadClients() {
    setLoading(true)

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setLoading(false); return }
    setUserId(authUser.id)

    // Own role (gates firm-client edit/delete)
    const { data: me } = await supabase
      .from("users")
      .select("role")
      .eq("id", authUser.id)
      .single()
    if (me?.role) setUserRole(me.role)

    // Assigned clients + firm-wide clients
    const { data: assignments } = await supabase
      .from("user_client_assignments")
      .select("client_id")
      .eq("user_id", authUser.id)
      .eq("is_active", true)

    const myClientIds = (assignments || []).map((a) => a.client_id)

    let query = supabase
      .from("clients")
      .select(`*, matters(*)`)
      .eq("is_active", true)
      .order("name")

    if (myClientIds.length > 0) {
      query = query.or(`is_firm_client.eq.true,id.in.(${myClientIds.join(",")})`)
    } else {
      query = query.eq("is_firm_client", true)
    }

    const { data: clientsData } = await query

    if (clientsData) {
      // Shared firm-wide consumption per matter (current calendar month)
      const { data: sharedRows } = await supabase.rpc("matter_consumption_current_month")
      const sharedByMatter = (sharedRows || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.matter_id] = Number(r.total_minutes) || 0
        return acc
      }, {})

      // Own contribution per matter (this month) — for the editable hours field
      const monthStart = startOfMonthBogota()
      const { data: mine } = await supabase
        .from("time_entries")
        .select("matter_id, duration_minutes")
        .eq("user_id", authUser.id)
        .gte("entry_date", monthStart)

      const myByMatter = (mine || []).reduce((acc: Record<string, number>, h: any) => {
        acc[h.matter_id] = (acc[h.matter_id] || 0) + h.duration_minutes
        return acc
      }, {})

      const built: ClientWithData[] = clientsData.map((c: any) => {
        const matters: MatterWithHours[] = (c.matters || [])
          .filter((m: any) => m.is_active !== false)
          .map((m: any) => ({
            ...m,
            consumedMinutes: sharedByMatter[m.id] || 0,
            myMinutes: myByMatter[m.id] || 0,
          }))
        const totalMinutes = matters.reduce((s, m) => s + m.consumedMinutes, 0)
        const myTotalMinutes = matters.reduce((s, m) => s + m.myMinutes, 0)
        return { ...c, matters, totalMinutes, myTotalMinutes }
      })

      // Firm clients first, then alphabetical
      built.sort((a, b) => {
        if (a.is_firm_client !== b.is_firm_client) return a.is_firm_client ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      setClients(built)

      if (selectedClient) {
        const refreshed = built.find((c) => c.id === selectedClient.id)
        setSelectedClient(refreshed || null)
      }
    }
    setLoading(false)
  }

  async function handleCreateClient() {
    if (!newClientName.trim()) {
      toast.error("Nombre requerido")
      return
    }

    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const capHours = parseFloat(newClientCap)
    const hasCap = !isNaN(capHours) && capHours > 0
    const asFirm = isSuperAdmin && newClientIsFirm

    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        name: newClientName.trim(),
        nit: newClientNit.trim() || null,
        billing_type: hasCap ? "fee" : "hourly",
        monthly_hour_cap: hasCap ? Math.round(capHours * 60) : null,
        is_firm_client: asFirm,
        created_by: currentUser?.id || null,
      })
      .select()
      .single()

    if (error) {
      toast.error("Error: " + error.message)
      return
    }

    // Firm clients are visible to all via RLS — no per-user assignment needed
    if (currentUser && !asFirm) {
      await supabase.from("user_client_assignments").insert({
        user_id: currentUser.id,
        client_id: client.id,
        is_active: true,
      })
    }

    // NO se crean asuntos ni horas por defecto

    toast.success(`"${newClientName}" creado`)
    setNewClientName("")
    setNewClientNit("")
    setNewClientCap("")
    setNewClientIsFirm(false)
    setNewClientOpen(false)
    loadClients()
  }

  async function handleDeleteClient(client: ClientWithData) {
    if (client.is_firm_client && !isSuperAdmin) {
      toast.error("Solo el super admin puede borrar clientes de la firma")
      return
    }
    if (!window.confirm(`¿Borrar el cliente "${client.name}" y todos sus asuntos y horas? Esta acción no se puede deshacer.`)) {
      return
    }

    const { error } = await supabase.from("clients").delete().eq("id", client.id)
    if (error) {
      toast.error("Error al borrar: " + error.message)
      return
    }
    toast.success(`"${client.name}" eliminado`)
    setSelectedClient(null)
    loadClients()
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  // Per-type aggregates for selected client (shared totals)
  const feeMatters = selectedClient?.matters.filter((m) => (m.billing_type || "fee") === "fee" && m.is_billable !== false) || []
  const hourlyMatters = selectedClient?.matters.filter((m) => m.billing_type === "hourly" && m.is_billable !== false) || []
  const projectMatters = selectedClient?.matters.filter((m) => m.billing_type === "project" && m.is_billable !== false) || []
  const nonBillableMatters = selectedClient?.matters.filter((m) => m.is_billable === false) || []
  const feeConsumed = feeMatters.reduce((s, m) => s + m.consumedMinutes, 0)
  const hourlyConsumed = hourlyMatters.reduce((s, m) => s + m.consumedMinutes, 0)
  const projectConsumed = projectMatters.reduce((s, m) => s + m.consumedMinutes, 0)
  const nonBillableConsumed = nonBillableMatters.reduce((s, m) => s + m.consumedMinutes, 0)
  const feeCap = feeCapStatus(feeConsumed, selectedClient?.monthly_hour_cap || null)

  return (
    <div className="flex h-full gap-4 p-4">
      {/* ─── Column 1: Client List ──────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col glass-panel rounded-3xl overflow-hidden">
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Clientes</h2>
            <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
              <DialogTrigger
                render={
                  <Button size="sm" className="h-8 rounded-xl bg-primary/90 hover:bg-primary text-xs cursor-pointer gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo Cliente
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-md glass-panel border-glass-border rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Nombre / Razón social</Label>
                    <Input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Nombre del cliente"
                      className="rounded-xl bg-white/5 border-white/10"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">NIT (opcional)</Label>
                    <Input
                      value={newClientNit}
                      onChange={(e) => setNewClientNit(e.target.value)}
                      placeholder="900123456"
                      className="rounded-xl bg-white/5 border-white/10"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      Cap de horas mensual (opcional)
                    </Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={newClientCap}
                      onChange={(e) => setNewClientCap(e.target.value)}
                      placeholder="Ej: 20 (solo fee mensual)"
                      className="rounded-xl bg-white/5 border-white/10"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Si pones un cap, el cliente es de fee mensual. El cap es único y compartido por todos los asuntos de fee. Se reinicia cada mes o al agotarse.
                    </p>
                  </div>
                  {isSuperAdmin && (
                    <label className="flex items-center gap-2 cursor-pointer rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={newClientIsFirm}
                        onChange={(e) => setNewClientIsFirm(e.target.checked)}
                        className="accent-primary cursor-pointer"
                      />
                      <span className="text-xs flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-primary/60" />
                        Cliente de la firma (compartido por todos los abogados)
                      </span>
                    </label>
                  )}
                  <Button onClick={handleCreateClient} className="w-full rounded-xl cursor-pointer">
                    Crear Cliente
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-9 h-9 rounded-xl bg-white/5 border-white/10 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {loading ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin clientes</p>
            </div>
          ) : (
            filtered.map((client) => {
              const isSelected = selectedClient?.id === client.id
              const cFeeConsumed = client.matters
                .filter((m) => (m.billing_type || "fee") === "fee")
                .reduce((s, m) => s + m.consumedMinutes, 0)
              const cap = feeCapStatus(cFeeConsumed, client.monthly_hour_cap)

              return (
                <button
                  key={client.id}
                  onClick={() => setSelectedClient(isSelected ? null : client)}
                  className={`w-full text-left px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                    isSelected
                      ? "bg-primary/15 border border-primary/30 glow-blue-sm"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate flex items-center gap-1.5">
                      {client.is_firm_client && <Lock className="h-3 w-3 text-primary/60 shrink-0" />}
                      {client.name}
                    </span>
                    {cap.hasCap && cap.pct >= 80 ? (
                      <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-300 border border-amber-500/30 gap-0.5 shrink-0">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {cap.pct}%
                      </Badge>
                    ) : client.totalMinutes > 0 ? (
                      <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                        Activo
                      </Badge>
                    ) : null}
                  </div>
                  {cap.hasCap ? (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Cap: {formatDuration(cap.current)} / {formatDuration(cap.cap)}
                      {cap.cycles > 0 && ` · reiniciado ${cap.cycles}×`}
                    </p>
                  ) : client.totalMinutes > 0 ? (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDuration(client.totalMinutes)} este mes
                    </p>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ─── Column 2: Matters ──────────────────────────── */}
      <div className="flex-1 flex flex-col glass-panel rounded-3xl overflow-hidden">
        {selectedClient ? (
          <>
            <div className="p-5 pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    {selectedClient.is_firm_client && <Lock className="h-4 w-4 text-primary/60" />}
                    {selectedClient.name}
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {selectedClient.nit ? `NIT ${selectedClient.nit} · ` : ""}
                    {selectedClient.is_firm_client ? "Cliente de la firma" : "Asuntos"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!selectedClient.is_firm_client && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer"
                      title="Compartir con otro abogado"
                      onClick={openShare}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEditClient(selectedClient) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Editar cliente / cap"
                      onClick={() => openEditClient(selectedClient)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400 cursor-pointer"
                    title={selectedClient.is_firm_client && !isSuperAdmin ? "Solo super admin" : "Borrar cliente"}
                    onClick={() => handleDeleteClient(selectedClient)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
              <DialogContent className="sm:max-w-md glass-panel border-glass-border rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Editar Cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Nombre / Razón social</Label>
                    <Input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className="rounded-xl bg-white/5 border-white/10" autoFocus />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">NIT (opcional)</Label>
                    <Input value={editClientNit} onChange={(e) => setEditClientNit(e.target.value)} placeholder="900123456" className="rounded-xl bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Cap de horas mensual (opcional)</Label>
                    <Input type="number" step="0.5" value={editClientCap} onChange={(e) => setEditClientCap(e.target.value)} placeholder="Ej: 20 — vacío = sin cap" className="rounded-xl bg-white/5 border-white/10" />
                    <p className="text-[10px] text-muted-foreground mt-1">Compartido por todos los asuntos de fee. Se reinicia cada mes o al agotarse.</p>
                  </div>
                  <Button onClick={handleUpdateClient} className="w-full rounded-xl cursor-pointer">Guardar cambios</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={shareOpen} onOpenChange={setShareOpen}>
              <DialogContent className="sm:max-w-md glass-panel border-glass-border rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Compartir cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-muted-foreground">
                    El abogado que elijas podrá registrar horas y asuntos de <strong>{selectedClient.name}</strong>.
                  </p>
                  <Select value={shareUserId} onValueChange={(v) => setShareUserId(v ?? "")}>
                    <SelectTrigger className="rounded-xl bg-white/5 border-white/10">
                      <SelectValue placeholder="Elige un abogado" />
                    </SelectTrigger>
                    <SelectContent>
                      {attorneys.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleShare} disabled={!shareUserId} className="w-full rounded-xl cursor-pointer">Compartir</Button>
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex-1 overflow-y-auto p-5">
              {selectedClient.matters.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Sin asuntos todavía</p>
                  <p className="text-xs mt-1 opacity-60">Agrega el primer asunto abajo</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />
                  <div className="space-y-4 pl-10">
                    {selectedClient.matters.map((matter) => (
                      <EditableMatterCard
                        key={matter.id}
                        matter={matter}
                        clientId={selectedClient.id}
                        clientCap={selectedClient.monthly_hour_cap}
                        attorneys={attorneys}
                        userId={userId}
                        onInvoice={() => setInvoiceMatter(matter)}
                        onRefresh={loadClients}
                      />
                    ))}
                  </div>
                </div>
              )}

              <AddMatterSection
                clientId={selectedClient.id}
                isFeeClient={!!selectedClient.monthly_hour_cap}
                onRefresh={loadClients}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Selecciona un cliente</p>
              <p className="text-xs mt-1 opacity-50">para ver sus asuntos</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Column 3: Conteo de Horas ──────────────────── */}
      <div className="w-80 shrink-0 flex flex-col glass-panel rounded-3xl overflow-hidden">
        {selectedClient ? (
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            <h3 className="text-base font-semibold">Conteo de Horas</h3>

            {/* Fee / Paquete — shared cap */}
            {feeMatters.length > 0 && (
              <div className="glass-panel rounded-2xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                  <p className="text-xs font-semibold text-blue-300">Fee Mensual / Paquete</p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-blue-300">
                      {formatDuration(feeCap.hasCap ? feeCap.current : feeConsumed)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">registradas (todos)</p>
                  </div>
                  {feeCap.hasCap && (
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatDuration(feeCap.cap)}</p>
                      <p className="text-[10px] text-muted-foreground">cap máximo</p>
                    </div>
                  )}
                </div>
                {feeCap.hasCap && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Consumo del cap</span>
                      <span className={feeCap.pct >= 100 ? "text-red-400 font-semibold" : feeCap.pct >= 80 ? "text-amber-400" : ""}>
                        {feeCap.pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          feeCap.pct >= 100 ? "bg-red-400" : feeCap.pct >= 80 ? "bg-amber-400" : "bg-blue-400"
                        }`}
                        style={{ width: `${Math.min(feeCap.pct, 100)}%` }}
                      />
                    </div>
                    {feeCap.cycles > 0 && (
                      <p className="text-[10px] text-amber-400">
                        Cap agotado y reiniciado {feeCap.cycles}× este mes
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Proyecto */}
            {projectMatters.length > 0 && (
              <div className="glass-panel rounded-2xl p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <p className="text-xs font-semibold text-amber-300">Proyecto / Trabajo Concreto</p>
                </div>
                <p className="text-2xl font-bold tabular-nums text-amber-300">{formatDuration(projectConsumed)}</p>
                <p className="text-[10px] text-muted-foreground">conteo independiente</p>
              </div>
            )}

            {/* Postpago */}
            {hourlyMatters.length > 0 && (() => {
              const totalCOP = hourlyMatters.reduce((s, m) => s + (m.consumedMinutes / 60) * (m.hourly_rate || 0), 0)
              const hasRate = hourlyMatters.some((m) => (m.hourly_rate || 0) > 0)
              return (
                <div className="glass-panel rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <p className="text-xs font-semibold text-emerald-300">Horas Postpago</p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-emerald-300">{formatDuration(hourlyConsumed)}</p>
                  {hasRate && (
                    <div className="flex items-baseline gap-1">
                      <DollarSign className="h-3 w-3 text-emerald-400" />
                      <p className="text-lg font-bold tabular-nums text-emerald-300">
                        {new Intl.NumberFormat("es-CO").format(Math.round(totalCOP))}
                      </p>
                      <span className="text-[10px] text-muted-foreground">más IVA (a facturar)</span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">conteo independiente</p>
                </div>
              )
            })()}

            {/* No Facturables */}
            {nonBillableMatters.length > 0 && (
              <div className="glass-panel rounded-2xl p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <p className="text-xs font-semibold text-slate-300">No Facturables</p>
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-300">{formatDuration(nonBillableConsumed)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {nonBillableMatters.length} asunto{nonBillableMatters.length > 1 ? "s" : ""} · no se factura
                </p>
              </div>
            )}

            {/* TOTAL */}
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Total Horas Cliente</p>
                <p className="text-2xl font-bold tabular-nums">{formatDuration(selectedClient.totalMinutes)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Suma de las modalidades · este mes
              </p>
              {selectedClient.myTotalMinutes > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Tu aporte: {formatDuration(selectedClient.myTotalMinutes)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Conteo de horas</p>
              <p className="text-[10px] mt-1 opacity-50">Selecciona un cliente para ver el detalle</p>
            </div>
          </div>
        )}
      </div>

      {/* Invoice modal */}
      {invoiceMatter && selectedClient && (
        <InvoiceModal
          matter={invoiceMatter}
          clientName={selectedClient.name}
          onClose={() => setInvoiceMatter(null)}
        />
      )}
    </div>
  )
}

// ─── EDITABLE MATTER CARD ────────────────────────────────

function EditableMatterCard({
  matter,
  clientId,
  clientCap,
  attorneys,
  userId,
  onInvoice,
  onRefresh,
}: {
  matter: MatterWithHours
  clientId: string
  clientCap: number | null
  attorneys: { id: string; full_name: string }[]
  userId: string
  onInvoice: () => void
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(matter.name)
  const [editDesc, setEditDesc] = useState(matter.description || "")
  const [editType, setEditType] = useState<BillingType>((matter.billing_type || "fee") as BillingType)
  const [editHours, setEditHours] = useState("")
  const [editRate, setEditRate] = useState(matter.hourly_rate?.toString() || "")
  const [editFee, setEditFee] = useState(matter.fixed_fee?.toString() || "")
  const [editBillable, setEditBillable] = useState(matter.is_billable ?? true)
  const [editDate, setEditDate] = useState(todayBogota())
  const [saving, setSaving] = useState(false)

  // Registrar horas — log a work session on this existing matter, optionally
  // shared with a collaborator (each gets full personal hours; the client
  // cap is only debited once, via counts_towards_cap on the DB side).
  const [logOpen, setLogOpen] = useState(false)
  const [logHours, setLogHours] = useState("")
  const [logDesc, setLogDesc] = useState("")
  const [logDate, setLogDate] = useState(todayBogota())
  const [logShared, setLogShared] = useState(false)
  const [logCollaboratorId, setLogCollaboratorId] = useState("")
  const [logSaving, setLogSaving] = useState(false)
  const otherAttorneys = attorneys.filter((a) => a.id !== userId)

  async function handleLogHours() {
    const mins = Math.round(parseFloat(logHours || "0") * 60)
    if (mins <= 0) { toast.error("Indica las horas trabajadas"); return }
    if (!logDesc.trim()) { toast.error("Descripción obligatoria"); return }
    if (logShared && !logCollaboratorId) { toast.error("Elige con quién compartiste"); return }

    setLogSaving(true)

    if (logShared) {
      const { error } = await supabase.rpc("create_shared_task", {
        p_client_id: clientId,
        p_matter_id: matter.id,
        p_title: logDesc.trim(),
        p_entry_date: logDate,
        p_duration_minutes: mins,
        p_description: logDesc.trim(),
        p_category: null,
        p_is_billable: matter.is_billable ?? true,
        p_source: "manual",
        p_applied_rate: matter.hourly_rate ?? null,
        p_participant_ids: [userId, logCollaboratorId],
      })
      setLogSaving(false)
      if (error) { toast.error("Error: " + error.message); return }
      const name = otherAttorneys.find((a) => a.id === logCollaboratorId)?.full_name || "colega"
      toast.success(`Horas registradas — compartidas con ${name}`, {
        description: `${logHours}h cada uno · solo ${logHours}h se suman al cliente`,
      })
    } else {
      const { error } = await supabase.from("time_entries").insert({
        user_id: userId,
        client_id: clientId,
        matter_id: matter.id,
        entry_date: logDate,
        duration_minutes: mins,
        description: logDesc.trim(),
        is_billable: matter.is_billable ?? true,
        source: "manual",
        billing_status: "draft",
        created_by: userId,
        applied_rate: matter.hourly_rate ?? null,
      })
      setLogSaving(false)
      if (error) { toast.error("Error: " + error.message); return }
      toast.success("Horas registradas")
    }

    setLogHours(""); setLogDesc(""); setLogShared(false); setLogCollaboratorId(""); setLogDate(todayBogota())
    setLogOpen(false)
    window.dispatchEvent(new CustomEvent("time-entry-created"))
    onRefresh()
  }

  const bt = matter.billing_type || "fee"
  const colors = BILLING_COLORS[bt] || BILLING_COLORS.fee

  function startEdit() {
    setEditName(matter.name)
    setEditDesc(matter.description || "")
    setEditType((matter.billing_type || "fee") as BillingType)
    setEditHours((matter.myMinutes / 60).toFixed(2))
    setEditRate(matter.hourly_rate?.toString() || "")
    setEditFee(matter.fixed_fee?.toString() || "")
    setEditBillable(matter.is_billable ?? true)
    setEditDate(todayBogota())
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)

    const updates: Record<string, unknown> = {
      name: editName.trim() || matter.name,
      description: editDesc.trim() || null,
      billing_type: editType,
      is_billable: editBillable,
      hourly_rate: editType === "hourly" && editRate ? parseFloat(editRate) : null,
      fixed_fee: editType === "project" && editFee ? parseFloat(editFee) : null,
    }

    const { error } = await supabase.from("matters").update(updates).eq("id", matter.id)
    if (error) {
      toast.error("Error: " + error.message)
      setSaving(false)
      return
    }

    // Adjust the attorney's OWN hours to the new value (creates a correction entry)
    const newMinutes = Math.round(parseFloat(editHours || "0") * 60)
    const diff = newMinutes - matter.myMinutes
    if (diff !== 0) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from("time_entries").insert({
          user_id: user.id,
          client_id: clientId,
          matter_id: matter.id,
          entry_date: editDate || todayBogota(),
          duration_minutes: diff,
          description: `Ajuste de horas — ${editName}`,
          is_billable: editBillable,
          source: "manual",
          billing_status: "draft",
          created_by: user.id,
          applied_rate: editType === "hourly" && editRate ? parseFloat(editRate) : null,
        })
        window.dispatchEvent(new CustomEvent("time-entry-created"))
      }
    }

    toast.success("Asunto actualizado")
    setEditing(false)
    setSaving(false)
    onRefresh()
  }

  async function handleDeleteMatter() {
    if (!window.confirm(`¿Borrar el asunto "${matter.name}" y sus horas? No se puede deshacer.`)) return
    const { error } = await supabase.from("matters").delete().eq("id", matter.id)
    if (error) {
      toast.error("Error al borrar: " + error.message)
      return
    }
    toast.success("Asunto eliminado")
    window.dispatchEvent(new CustomEvent("time-entry-created"))
    onRefresh()
  }

  if (editing) {
    return (
      <div className="relative">
        <div className="absolute -left-[34px] top-4 w-3 h-3 rounded-full border-2 border-background bg-primary glow-blue-sm" />
        <div className="glass-panel rounded-2xl p-4 border border-primary/30 space-y-3">
          <p className="text-xs font-semibold text-primary">Editando asunto</p>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Nombre del asunto"
            className="rounded-xl bg-white/5 border-white/10 h-8 text-xs"
            autoFocus
          />
          <Input
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Descripción (opcional)"
            className="rounded-xl bg-white/5 border-white/10 h-8 text-xs"
          />
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Modalidad</Label>
            <Select value={editType} onValueChange={(v) => setEditType((v ?? "fee") as BillingType)}>
              <SelectTrigger className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fee">Fee mensual / Paquete (consume cap)</SelectItem>
                <SelectItem value="hourly">Horas postpago</SelectItem>
                <SelectItem value="project">Proyecto / Trabajo concreto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tus horas este mes</Label>
            <Input
              type="number"
              step="0.25"
              value={editHours}
              onChange={(e) => setEditHours(e.target.value)}
              className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1"
            />
            <p className="text-[9px] text-muted-foreground mt-0.5">
              Tu aporte actual: {(matter.myMinutes / 60).toFixed(2)}h — cambia para ajustar
            </p>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fecha del ajuste</Label>
            <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editBillable} onChange={(e) => setEditBillable(e.target.checked)} className="accent-primary cursor-pointer" />
            <span className="text-xs">Facturable</span>
          </label>
          {editType === "hourly" && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor hora COP</Label>
              <Input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" />
            </div>
          )}
          {editType === "project" && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor total COP</Label>
              <Input type="number" value={editFee} onChange={(e) => setEditFee(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" />
            </div>
          )}
          {editType === "fee" && (
            <p className="text-[9px] text-muted-foreground">Las horas de fee consumen el cap compartido del cliente.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 rounded-xl text-xs h-8 cursor-pointer">
              <Check className="h-3 w-3 mr-1" />{saving ? "Guardando..." : "Guardar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="rounded-xl text-xs h-8 cursor-pointer">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const showCapBar = bt === "fee" && clientCap != null && clientCap > 0
  const capPct = showCapBar ? Math.round(((matter.consumedMinutes % clientCap!) / clientCap!) * 100) : 0

  return (
    <div className="relative group">
      <div className={`absolute -left-[34px] top-4 w-3 h-3 rounded-full border-2 border-background ${
        matter.consumedMinutes > 0 ? "bg-primary glow-blue-sm" : "bg-muted-foreground/30"
      }`} />

      <div className="glass-panel glass-panel-hover rounded-2xl p-4 transition-all">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <p className="font-medium text-sm">{matter.name}</p>
            {matter.description && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{matter.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge className={`text-[9px] px-1.5 py-0 border ${colors.badge}`}>
              {BILLING_TYPE_SHORT[bt as BillingType] || "Fee"}
            </Badge>
            {matter.is_billable === false && (
              <Badge className="text-[9px] px-1.5 py-0 border bg-white/5 text-muted-foreground border-white/10">
                No facturable
              </Badge>
            )}
            <button
              onClick={startEdit}
              className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              title="Editar asunto"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDeleteMatter}
              className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              title="Borrar asunto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onInvoice}
              className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              title="Facturar"
            >
              <Receipt className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setLogOpen((v) => !v)}
              className={`p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer ${logOpen ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
              title="Registrar horas"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {logOpen && (
          <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.25"
                value={logHours}
                onChange={(e) => setLogHours(e.target.value)}
                placeholder="Horas"
                className="rounded-lg bg-white/5 border-white/10 h-8 text-xs"
              />
              <Input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="rounded-lg bg-white/5 border-white/10 h-8 text-xs"
              />
            </div>
            <Textarea
              value={logDesc}
              onChange={(e) => setLogDesc(e.target.value)}
              placeholder="Descripción del trabajo"
              className="rounded-lg bg-white/5 border-white/10 text-xs resize-none"
              rows={2}
            />
            {otherAttorneys.length > 0 && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={logShared}
                    onChange={(e) => { setLogShared(e.target.checked); if (!e.target.checked) setLogCollaboratorId("") }}
                    className="accent-primary cursor-pointer"
                  />
                  <span className="text-xs">Compartido con...</span>
                </label>
                {logShared && (
                  <>
                    <Select value={logCollaboratorId} onValueChange={(v) => setLogCollaboratorId(v ?? "")}>
                      <SelectTrigger className="rounded-lg bg-white/5 border-white/10 h-8 text-xs">
                        <SelectValue placeholder="Elige el abogado" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherAttorneys.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[9px] text-muted-foreground">
                      Cada uno registra {logHours || "0"}h propias — al cliente solo se le suman {logHours || "0"}h una vez
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleLogHours} disabled={logSaving} className="flex-1 rounded-lg text-xs h-8 cursor-pointer">
                <Check className="h-3 w-3 mr-1" />{logSaving ? "Guardando..." : "Registrar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLogOpen(false)} className="rounded-lg text-xs h-8 cursor-pointer">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {matter.consumedMinutes > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${colors.badge}`}>
              {formatDuration(matter.consumedMinutes)}
            </div>
            {bt === "hourly" && matter.hourly_rate != null && (
              <span className="text-[10px] text-muted-foreground">
                × ${new Intl.NumberFormat("es-CO").format(matter.hourly_rate)}/h
              </span>
            )}
          </div>
        )}

        {showCapBar && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Consume el cap del cliente</span>
              <span>{capPct}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capPct >= 100 ? "bg-red-400" : capPct >= 80 ? "bg-amber-400" : colors.bar
                }`}
                style={{ width: `${Math.min(capPct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ADD MATTER SECTION ──────────────────────────────────

function AddMatterSection({
  clientId,
  isFeeClient,
  onRefresh,
}: {
  clientId: string
  isFeeClient: boolean
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [type, setType] = useState<BillingType>(isFeeClient ? "fee" : "hourly")
  const [rate, setRate] = useState("")
  const [fee, setFee] = useState("")
  const [hours, setHours] = useState("")
  const [billable, setBillable] = useState(true)
  const [date, setDate] = useState(todayBogota())

  async function handleAdd() {
    if (!name.trim()) { toast.error("Nombre requerido"); return }

    const insertData: Record<string, unknown> = {
      client_id: clientId,
      name: name.trim(),
      description: desc.trim() || null,
      is_default: false,
      billing_type: type,
      is_billable: billable,
    }
    if (type === "hourly" && rate) insertData.hourly_rate = parseFloat(rate)
    if (type === "project" && fee) insertData.fixed_fee = parseFloat(fee)

    const { data: newMatter, error } = await supabase.from("matters").insert(insertData).select().single()
    if (error) { toast.error("Error: " + error.message); return }

    // Optional: hours already worked (only if the user types a value)
    if (hours && parseFloat(hours) > 0 && newMatter) {
      const durationMinutes = Math.round(parseFloat(hours) * 60)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from("time_entries").insert({
          user_id: user.id,
          client_id: clientId,
          matter_id: newMatter.id,
          entry_date: date || todayBogota(),
          duration_minutes: durationMinutes,
          description: `${name.trim()}${desc.trim() ? " — " + desc.trim() : ""}`,
          is_billable: billable,
          source: "manual",
          billing_status: "draft",
          created_by: user.id,
          applied_rate: type === "hourly" && rate ? parseFloat(rate) : null,
        })
        window.dispatchEvent(new CustomEvent("time-entry-created"))
      }
    }

    toast.success("Asunto creado")
    setName(""); setDesc(""); setRate(""); setFee(""); setHours(""); setBillable(true); setDate(todayBogota()); setType(isFeeClient ? "fee" : "hourly")
    setOpen(false)
    onRefresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-6 py-3 rounded-2xl border border-dashed border-white/10 text-sm text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors cursor-pointer flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Agregar asunto
      </button>
    )
  }

  return (
    <div className="mt-6 glass-panel rounded-2xl p-4 space-y-3">
      <p className="text-sm font-semibold">Nuevo asunto</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" autoFocus />
      <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)" className="rounded-xl bg-white/5 border-white/10 text-xs resize-none" rows={2} />
      <Select value={type} onValueChange={(v) => setType((v ?? "fee") as BillingType)}>
        <SelectTrigger className="rounded-xl bg-white/5 border-white/10 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fee">Fee mensual / Paquete (consume cap)</SelectItem>
          <SelectItem value="hourly">Horas postpago</SelectItem>
          <SelectItem value="project">Proyecto / Trabajo concreto</SelectItem>
        </SelectContent>
      </Select>
      {type === "hourly" && <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Valor hora COP" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" />}
      {type === "project" && <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Valor total COP" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" />}
      {type === "fee" && <p className="text-[9px] text-muted-foreground">Las horas de fee consumen el cap compartido del cliente.</p>}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="accent-primary cursor-pointer" />
        <span className="text-xs">Facturable</span>
      </label>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fecha de las horas</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" />
      </div>
      <Input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Horas ya trabajadas (opcional)" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} className="flex-1 rounded-xl text-xs h-8 cursor-pointer"><Check className="h-3 w-3 mr-1" />Crear</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl text-xs h-8 cursor-pointer"><X className="h-3 w-3" /></Button>
      </div>
    </div>
  )
}

// ─── INVOICE MODAL ───────────────────────────────────────

function InvoiceModal({
  matter,
  clientName,
  onClose,
}: {
  matter: MatterWithHours
  clientName: string
  onClose: () => void
}) {
  const bt = matter.billing_type || "fee"
  const hoursWorked = matter.consumedMinutes / 60
  const hourlyRate = matter.hourly_rate || 0
  const fixedFee = matter.fixed_fee || 0

  let autoValue = 0
  if (bt === "hourly") autoValue = Math.round(hoursWorked * hourlyRate)
  else if (bt === "project") autoValue = fixedFee

  const [consecutivo, setConsecutivo] = useState("")
  const [valorTotal, setValorTotal] = useState(autoValue > 0 ? autoValue.toString() : "")
  const [valorFacturar, setValorFacturar] = useState(autoValue > 0 ? autoValue.toString() : "")
  const [porcentaje, setPorcentaje] = useState("100")
  const [concepto, setConcepto] = useState(matter.description || matter.name)
  const [descripcion, setDescripcion] = useState(
    bt === "hourly" ? `${hoursWorked.toFixed(1)} horas de ${matter.name}` : matter.name
  )
  const [firmante, setFirmante] = useState("")
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  function formatCOP(n: number) {
    return `$${new Intl.NumberFormat("es-CO").format(n)}`
  }

  async function handleSendInvoice() {
    if (!valorFacturar || !concepto) { toast.error("Completa valor y concepto"); return }
    if (!firmante.trim()) { toast.error("Indica quién firma la solicitud"); return }
    setSending(true)

    const firmanteNombre = firmante.trim()
    const asunto = `Solicitud de facturación – ${clientName}`
    const cuerpo_html = `<p>Hola Juli,</p>
<p>Espero que estés muy bien. Me ayudas porfa con una factura para <strong>${clientName}</strong>. Cobro del <strong>${porcentaje}%</strong> del siguiente ítem:</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
  <tr><td style="width:220px;"><strong>Cliente</strong></td><td>${clientName}</td></tr>
  <tr><td><strong>Consecutivo de propuesta</strong></td><td>${consecutivo || "Pendiente"}</td></tr>
  <tr><td><strong>Valor total del servicio</strong></td><td>${formatCOP(parseInt(valorTotal || "0"))} más IVA</td></tr>
  <tr><td><strong>Valor a facturar</strong></td><td>${formatCOP(parseInt(valorFacturar))} más IVA</td></tr>
  <tr><td><strong>% a facturar</strong></td><td>${porcentaje}%</td></tr>
  <tr><td><strong>Concepto</strong></td><td>${concepto}</td></tr>
  <tr><td><strong>Descripción</strong></td><td>${descripcion}</td></tr>
</table>
<p>Saludos,<br><strong>${firmanteNombre}</strong></p>`
    const cuerpo_texto = `Hola Juli,\n\nEspero que estés muy bien. Me ayudas porfa con una factura para ${clientName}. Cobro del ${porcentaje}% del siguiente ítem:\n\nCliente: ${clientName}\nConsecutivo: ${consecutivo || "Pendiente"}\nValor total: ${formatCOP(parseInt(valorTotal || "0"))} más IVA\nValor a facturar: ${formatCOP(parseInt(valorFacturar))} más IVA\n% a facturar: ${porcentaje}%\nConcepto: ${concepto}\nDescripción: ${descripcion}\n\nSaludos,\n${firmanteNombre}`

    const invoiceData = {
      cliente: clientName,
      consecutivo: consecutivo || "Pendiente",
      valorTotal: `${formatCOP(parseInt(valorTotal || "0"))} más IVA`,
      valorFacturar: `${formatCOP(parseInt(valorFacturar))} más IVA`,
      porcentaje: `${porcentaje}%`,
      concepto,
      descripcion,
      firmante: firmanteNombre,
      matterType: bt,
      hoursWorked,
      hourlyRate,
      // Pre-built email fields — Make usa estas directamente
      asunto,
      cuerpo_html,
      cuerpo_texto,
    }

    try {
      // POST a nuestro API route (mismo origen → sin CORS); el server reenvía a Make.
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceData),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      toast.success("Factura enviada a auxiliar@quarta.co", {
        description: `${clientName} — ${formatCOP(parseInt(valorFacturar))} más IVA`,
        duration: 8000,
      })
      setSending(false)
      onClose()
    } catch (err: any) {
      // Fallback secundario: copiar al portapapeles si el envío falla
      const text = `Solicitud de facturación – ${clientName}\n\nCliente: ${clientName}\nConsecutivo: ${consecutivo || "Pendiente"}\nValor total: ${formatCOP(parseInt(valorTotal || "0"))} más IVA\nValor a facturar: ${formatCOP(parseInt(valorFacturar))} más IVA\n% a facturar: ${porcentaje}%\nConcepto: ${concepto}\nDescripción: ${descripcion}\n\nSaludos,\n${firmante.trim()}`
      try { await navigator.clipboard.writeText(text) } catch {}
      toast.error("No se pudo enviar (" + (err?.message || "error") + "). Datos copiados al portapapeles como respaldo.", { duration: 9000 })
      setSending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg glass-panel border-glass-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-5 w-5 text-primary" />
            Facturar: {matter.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {bt === "hourly" && autoValue > 0 && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
              <p className="font-medium text-emerald-300">Cálculo automático</p>
              <p className="text-emerald-400 mt-0.5">
                {hoursWorked.toFixed(1)}h × ${new Intl.NumberFormat("es-CO").format(hourlyRate)}/h = <strong>{formatCOP(autoValue)} más IVA</strong>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Consecutivo</Label><Input value={consecutivo} onChange={(e) => setConsecutivo(e.target.value)} placeholder="Q-2024-045" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" /></div>
            <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">% a facturar</Label><Input value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" type="number" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor total (COP)</Label><Input value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" type="number" /></div>
            <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor a facturar</Label><Input value={valorFacturar} onChange={(e) => setValorFacturar(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" type="number" /></div>
          </div>
          <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" /></div>
          <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Descripción</Label><Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="rounded-xl bg-white/5 border-white/10 text-xs resize-none mt-1" rows={2} /></div>
          <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Firma (quién solicita)</Label><Input value={firmante} onChange={(e) => setFirmante(e.target.value)} placeholder="Tu nombre — va al pie del correo" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs mt-1" /></div>

          <button className="text-[11px] text-primary underline cursor-pointer" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
          </button>

          {showPreview && (
            <div className="glass-panel rounded-xl p-3 text-xs space-y-2">
              <p className="text-muted-foreground"><strong>Para:</strong> auxiliar@quarta.co</p>
              <p className="text-muted-foreground"><strong>Asunto:</strong> Solicitud de facturación – {clientName}</p>
              <hr className="border-white/10" />
              <p>Hola Juli,</p>
              <p>Me ayudas con una factura para <strong>{clientName}</strong>. Cobro del <strong>{porcentaje}%</strong>:</p>
              <table className="w-full border-collapse text-[11px] mt-2">
                <tbody>
                  {[
                    ["Cliente", clientName],
                    ["Consecutivo", consecutivo || "Pendiente"],
                    ["Valor total", valorTotal ? `${formatCOP(parseInt(valorTotal))} más IVA` : "—"],
                    ["Valor a facturar", valorFacturar ? `${formatCOP(parseInt(valorFacturar))} más IVA` : "—"],
                    ["% a facturar", `${porcentaje}%`],
                    ["Concepto", concepto],
                    ["Descripción", descripcion],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-white/5">
                      <td className="py-1.5 px-2 font-semibold w-36 bg-white/3">{k}</td>
                      <td className="py-1.5 px-2">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2">Saludos,<br /><strong>{firmante || "—"}</strong></p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSendInvoice} disabled={sending || !valorFacturar} className="flex-1 rounded-xl cursor-pointer gap-2">
              <Send className="h-4 w-4" />
              {sending ? "Enviando..." : "Enviar a auxiliar@quarta.co"}
            </Button>
            <Button variant="outline" className="rounded-xl cursor-pointer border-white/10" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
