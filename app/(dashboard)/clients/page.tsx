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
  DollarSign, Hourglass, Send, Receipt, AlertTriangle, ChevronRight,
} from "lucide-react"
import type { Client, Matter, BillingType } from "@/lib/types"
import { BILLING_TYPE_SHORT } from "@/lib/types"

// ─── TYPES ───────────────────────────────────────────────

interface MatterWithHours extends Matter {
  consumedMinutes: number
}

interface ClientWithData extends Client {
  matters: MatterWithHours[]
  totalMinutes: number
}

// ─── COLORS PER BILLING TYPE ─────────────────────────────

const BILLING_COLORS: Record<string, { bar: string; badge: string; glow: string }> = {
  fee:     { bar: "bg-blue-400",    badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",    glow: "shadow-[0_0_10px_rgba(59,130,246,0.3)]" },
  hourly:  { bar: "bg-emerald-400", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", glow: "shadow-[0_0_10px_rgba(16,185,129,0.3)]" },
  project: { bar: "bg-amber-400",   badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",   glow: "shadow-[0_0_10px_rgba(245,158,11,0.3)]" },
}

// ─── MAIN PAGE — 3-Column Layout ─────────────────────────

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<ClientWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<ClientWithData | null>(null)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [invoiceMatter, setInvoiceMatter] = useState<MatterWithHours | null>(null)

  useEffect(() => {
    loadClients()

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
      const monthStart = startOfMonthBogota()
      const { data: hours } = await supabase
        .from("time_entries")
        .select("client_id, matter_id, duration_minutes")
        .eq("user_id", authUser.id)
        .in("client_id", myClientIds)
        .gte("entry_date", monthStart)

      const hoursByMatter = (hours || []).reduce((acc, h) => {
        acc[h.matter_id] = (acc[h.matter_id] || 0) + h.duration_minutes
        return acc
      }, {} as Record<string, number>)

      const hoursByClient = (hours || []).reduce((acc, h) => {
        acc[h.client_id] = (acc[h.client_id] || 0) + h.duration_minutes
        return acc
      }, {} as Record<string, number>)

      const built = clientsData.map((c: any) => ({
        ...c,
        matters: (c.matters || []).map((m: any) => ({
          ...m,
          consumedMinutes: hoursByMatter[m.id] || 0,
        })),
        totalMinutes: hoursByClient[c.id] || 0,
      }))

      setClients(built)

      if (selectedClient) {
        const refreshed = built.find((c) => c.id === selectedClient.id)
        if (refreshed) setSelectedClient(refreshed)
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

    const { data: client, error } = await supabase
      .from("clients")
      .insert({
        name: newClientName.trim(),
        billing_type: "hourly",
        created_by: currentUser?.id || null,
      })
      .select()
      .single()

    if (error) {
      toast.error("Error: " + error.message)
      return
    }

    if (currentUser) {
      await supabase.from("user_client_assignments").insert({
        user_id: currentUser.id,
        client_id: client.id,
        is_active: true,
      })
    }

    await supabase.from("matters").insert({
      client_id: client.id,
      name: "General",
      is_default: true,
      billing_type: "hourly",
    })

    toast.success(`"${newClientName}" creado`)
    setNewClientName("")
    setNewClientOpen(false)
    loadClients()
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  // Calculate billing metrics for selected client
  const feeMatters = selectedClient?.matters.filter((m) => m.billing_type === "fee") || []
  const hourlyMatters = selectedClient?.matters.filter((m) => m.billing_type === "hourly") || []
  const projectMatters = selectedClient?.matters.filter((m) => m.billing_type === "project") || []
  const feeConsumed = feeMatters.reduce((s, m) => s + m.consumedMinutes, 0)
  const feeCap = feeMatters.reduce((s, m) => s + (m.hour_cap || 0), 0)
  const hourlyConsumed = hourlyMatters.reduce((s, m) => s + m.consumedMinutes, 0)
  const projectConsumed = projectMatters.reduce((s, m) => s + m.consumedMinutes, 0)

  return (
    <div className="flex h-full gap-4 p-4">
      {/* ─── Column 1: Client List ──────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col glass-panel rounded-3xl overflow-hidden">
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Clients</h2>
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
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Nombre del cliente o razón social"
                    className="rounded-xl bg-white/5 border-white/10"
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground">
                    La modalidad de cobro se define al agregar cada asunto.
                  </p>
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
              const hasFee = client.matters.some((m) => m.billing_type === "fee")
              const feeMins = client.matters.filter((m) => m.billing_type === "fee").reduce((s, m) => s + m.consumedMinutes, 0)
              const fCap = client.matters.filter((m) => m.billing_type === "fee").reduce((s, m) => s + (m.hour_cap || 0), 0)
              const capPct = fCap > 0 ? Math.round((feeMins / fCap) * 100) : 0

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
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{client.name}</span>
                    <div className="flex items-center gap-1.5">
                      {hasFee && capPct >= 80 ? (
                        <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-300 border border-amber-500/30 gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Budget Alert
                        </Badge>
                      ) : (
                        <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Active
                        </Badge>
                      )}
                    </div>
                  </div>
                  {client.totalMinutes > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDuration(client.totalMinutes)} este mes
                    </p>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ─── Column 2: Matters & Timeline ───────────────── */}
      <div className="flex-1 flex flex-col glass-panel rounded-3xl overflow-hidden">
        {selectedClient ? (
          <>
            <div className="p-5 pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedClient.name}
                  <span className="text-muted-foreground font-normal text-sm ml-2">
                    Matters & Timeline
                  </span>
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-400 cursor-pointer"
                  onClick={() => {
                    // Delete handler
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Timeline */}
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />

                <div className="space-y-4 pl-10">
                  {selectedClient.matters.map((matter) => {
                    const bt = matter.billing_type || "hourly"
                    const colors = BILLING_COLORS[bt] || BILLING_COLORS.hourly

                    return (
                      <div key={matter.id} className="relative group">
                        {/* Timeline dot */}
                        <div className={`absolute -left-[34px] top-4 w-3 h-3 rounded-full border-2 border-background ${
                          matter.consumedMinutes > 0 ? "bg-primary glow-blue-sm" : "bg-muted-foreground/30"
                        }`} />

                        {/* Matter card */}
                        <div className="glass-panel glass-panel-hover rounded-2xl p-4 transition-all">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium text-sm">{matter.name}</p>
                              {matter.description && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">{matter.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge className={`text-[9px] px-1.5 py-0 border ${colors.badge}`}>
                                {BILLING_TYPE_SHORT[bt as BillingType] || "Horas"}
                              </Badge>
                              {!matter.is_default && (
                                <button
                                  onClick={() => setInvoiceMatter(matter)}
                                  className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                  title="Facturar"
                                >
                                  <Receipt className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Time entry display */}
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

                          {/* Fee cap progress */}
                          {bt === "fee" && matter.hour_cap != null && matter.hour_cap > 0 && (
                            <div className="mt-3 space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Budget Used</span>
                                <span>{Math.round((matter.consumedMinutes / matter.hour_cap) * 100)}%</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    matter.consumedMinutes / matter.hour_cap >= 1 ? "bg-red-400" :
                                    matter.consumedMinutes / matter.hour_cap >= 0.8 ? "bg-amber-400" :
                                    colors.bar
                                  }`}
                                  style={{ width: `${Math.min((matter.consumedMinutes / matter.hour_cap) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Add matter */}
              <AddMatterSection clientId={selectedClient.id} onRefresh={loadClients} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Selecciona un cliente</p>
              <p className="text-xs mt-1 opacity-50">para ver sus asuntos y timeline</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Column 3: Billing Metrics & Quick Log ──────── */}
      <div className="w-80 shrink-0 flex flex-col glass-panel rounded-3xl overflow-hidden">
        {selectedClient ? (
          <div className="p-5 space-y-6 overflow-y-auto">
            <h3 className="text-base font-semibold">Billing Metrics & Quick Log</h3>

            {/* Total Hours */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold tabular-nums">{formatDuration(selectedClient.totalMinutes)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Real-time: {formatDuration(selectedClient.totalMinutes)} stats
              </p>
            </div>

            {/* Per-type breakdown */}
            {feeMatters.length > 0 && (
              <MetricRow
                label="Budget Used"
                value={formatDuration(feeConsumed)}
                type="fee"
                consumed={feeConsumed}
                cap={feeCap}
              />
            )}
            {hourlyMatters.length > 0 && (
              <MetricRow
                label="Horas Postpago"
                value={formatDuration(hourlyConsumed)}
                type="hourly"
                consumed={hourlyConsumed}
                cap={0}
              />
            )}
            {projectMatters.length > 0 && (
              <MetricRow
                label="Proyectos"
                value={formatDuration(projectConsumed)}
                type="project"
                consumed={projectConsumed}
                cap={0}
              />
            )}

            {/* Quick Log */}
            <div className="pt-2 border-t border-white/5">
              <h4 className="text-sm font-semibold mb-3">Quick Log</h4>
              <QuickLogForm client={selectedClient} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Métricas y quick log</p>
              <p className="text-[10px] mt-1 opacity-50">aparecerán al seleccionar un cliente</p>
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

// ─── METRIC ROW ─────────────────────────────────────────

function MetricRow({
  label,
  value,
  type,
  consumed,
  cap,
}: {
  label: string
  value: string
  type: string
  consumed: number
  cap: number
}) {
  const colors = BILLING_COLORS[type] || BILLING_COLORS.hourly
  const pct = cap > 0 ? Math.round((consumed / cap) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
      {cap > 0 && (
        <>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Consumed/tase</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : colors.bar
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── QUICK LOG FORM ──────────────────────────────────────

function QuickLogForm({ client }: { client: ClientWithData }) {
  const supabase = createClient()
  const [matterId, setMatterId] = useState(client.matters[0]?.id || "")
  const [duration, setDuration] = useState("1h 00m")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (client.matters.length > 0 && !client.matters.find((m) => m.id === matterId)) {
      setMatterId(client.matters[0].id)
    }
  }, [client.id])

  async function handleLog() {
    if (!matterId) return
    setSaving(true)

    const match = duration.match(/(\d+)h\s*(\d+)m/)
    const mins = match ? parseInt(match[1]) * 60 + parseInt(match[2]) : 60

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const matter = client.matters.find((m) => m.id === matterId)

    const { error } = await supabase.from("time_entries").insert({
      user_id: user.id,
      client_id: client.id,
      matter_id: matterId,
      entry_date: todayBogota(),
      duration_minutes: mins,
      description: `Quick log — ${matter?.name || ""}`,
      is_billable: true,
      source: "manual",
      billing_status: "draft",
      created_by: user.id,
      applied_rate: matter?.hourly_rate || null,
    })

    if (error) {
      toast.error("Error: " + error.message)
    } else {
      toast.success(`${formatDuration(mins)} registradas`)
      window.dispatchEvent(new CustomEvent("time-entry-created"))
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Client</Label>
        <div className="glass-panel rounded-xl px-3 py-2 text-sm">{client.name}</div>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Matter</Label>
        <Select value={matterId} onValueChange={(v) => setMatterId(v ?? "")}>
          <SelectTrigger className="rounded-xl bg-white/5 border-white/10 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {client.matters.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Time</Label>
        <div className="flex items-center gap-2 glass-panel rounded-xl px-3 py-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0"
          />
        </div>
      </div>
      <Button
        onClick={handleLog}
        disabled={saving}
        className="w-full rounded-xl bg-primary hover:bg-primary/90 cursor-pointer"
      >
        {saving ? "Registrando..." : "Log Time"}
      </Button>
    </div>
  )
}

// ─── ADD MATTER SECTION ──────────────────────────────────

function AddMatterSection({
  clientId,
  onRefresh,
}: {
  clientId: string
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [type, setType] = useState<BillingType>("hourly")
  const [cap, setCap] = useState("")
  const [rate, setRate] = useState("")
  const [fee, setFee] = useState("")
  const [hours, setHours] = useState("")

  async function handleAdd() {
    if (!name.trim()) { toast.error("Nombre requerido"); return }

    const insertData: Record<string, unknown> = {
      client_id: clientId,
      name: name.trim(),
      description: desc.trim() || null,
      is_default: false,
      billing_type: type,
      allocated_hours: hours ? parseFloat(hours) : null,
    }

    if (type === "fee" && cap) insertData.hour_cap = Math.round(parseFloat(cap) * 60)
    if (type === "hourly" && rate) insertData.hourly_rate = parseFloat(rate)
    if (type === "project" && fee) insertData.fixed_fee = parseFloat(fee)

    const { data: newMatter, error } = await supabase.from("matters").insert(insertData).select().single()

    if (error) { toast.error("Error: " + error.message); return }

    if (hours && parseFloat(hours) > 0 && newMatter) {
      const durationMinutes = Math.round(parseFloat(hours) * 60)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from("time_entries").insert({
          user_id: user.id,
          client_id: clientId,
          matter_id: newMatter.id,
          entry_date: todayBogota(),
          duration_minutes: durationMinutes,
          description: `${name.trim()}${desc.trim() ? " — " + desc.trim() : ""}`,
          is_billable: true,
          source: "manual",
          billing_status: "draft",
          created_by: user.id,
          applied_rate: type === "hourly" && rate ? parseFloat(rate) : null,
        })
        window.dispatchEvent(new CustomEvent("time-entry-created"))
      }
    }

    toast.success("Asunto creado")
    setName(""); setDesc(""); setCap(""); setRate(""); setFee(""); setHours(""); setType("hourly")
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
      <Select value={type} onValueChange={(v) => setType((v ?? "hourly") as BillingType)}>
        <SelectTrigger className="rounded-xl bg-white/5 border-white/10 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fee">Paquete / Fee mensual</SelectItem>
          <SelectItem value="hourly">Horas postpago</SelectItem>
          <SelectItem value="project">Proyecto concreto</SelectItem>
        </SelectContent>
      </Select>
      {type === "fee" && <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Cap horas (ej: 42)" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" />}
      {type === "hourly" && <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Valor hora COP" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" />}
      {type === "project" && <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Valor total COP" className="rounded-xl bg-white/5 border-white/10 h-8 text-xs" />}
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
  const bt = matter.billing_type || "hourly"
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
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  function formatCOP(n: number) {
    return `$${new Intl.NumberFormat("es-CO").format(n)}`
  }

  async function handleSendInvoice() {
    if (!valorFacturar || !concepto) { toast.error("Completa valor y concepto"); return }
    setSending(true)

    const webhookUrl = process.env.NEXT_PUBLIC_INVOICE_WEBHOOK_URL
    const invoiceData = {
      cliente: clientName,
      consecutivo: consecutivo || "Pendiente",
      valorTotal: `${formatCOP(parseInt(valorTotal))} más IVA`,
      valorFacturar: `${formatCOP(parseInt(valorFacturar))} más IVA`,
      porcentaje: `${porcentaje}%`,
      concepto,
      descripcion,
      matterType: bt,
      hoursWorked,
      hourlyRate,
    }

    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invoiceData),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast.success("Factura enviada a auxiliar@quarta.co", {
          description: `${clientName} — ${formatCOP(parseInt(valorFacturar))} más IVA`,
          duration: 8000,
        })
      } catch (err: any) {
        toast.error("Error: " + err.message)
        setSending(false)
        return
      }
    } else {
      const text = `Solicitud de facturación – ${clientName}\n\nCliente: ${clientName}\nConsecutivo: ${consecutivo || "Pendiente"}\nValor total: ${formatCOP(parseInt(valorTotal || "0"))} más IVA\nValor a facturar: ${formatCOP(parseInt(valorFacturar))} más IVA\n% a facturar: ${porcentaje}%\nConcepto: ${concepto}\nDescripción: ${descripcion}`
      await navigator.clipboard.writeText(text)
      toast.success("Datos copiados al portapapeles", { duration: 8000 })
    }

    setSending(false)
    onClose()
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
