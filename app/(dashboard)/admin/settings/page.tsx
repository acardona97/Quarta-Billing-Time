"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Settings, Building2, Clock, Shield } from "lucide-react"

export default function SettingsPage() {
  const [firmName, setFirmName] = useState("Quarta Acompañamiento de Negocios")
  const [defaultGoalHours, setDefaultGoalHours] = useState("6")
  const [editWindowDays, setEditWindowDays] = useState("7")
  const [requireApprovalPastWindow, setRequireApprovalPastWindow] = useState(true)
  const [capWarningPercent, setCapWarningPercent] = useState("80")
  const [capCriticalPercent, setCapCriticalPercent] = useState("100")
  const [saving, setSaving] = useState(false)

  function handleSave() {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Configuración guardada")
    }, 500)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configuración
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ajustes generales de la plataforma
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Firma
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nombre</Label>
            <Input value={firmName} onChange={(e) => setFirmName(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Reglas de registro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Meta diaria default (horas)
            </Label>
            <Input
              type="number"
              value={defaultGoalHours}
              onChange={(e) => setDefaultGoalHours(e.target.value)}
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Meta default para nuevos abogados (cada uno personaliza)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Ventana de auto-edición (días)
            </Label>
            <Input
              type="number"
              value={editWindowDays}
              onChange={(e) => setEditWindowDays(e.target.value)}
              className="w-32"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Aprobación para edición tardía</p>
              <p className="text-[11px] text-muted-foreground">
                Requiere admin para editar fuera de ventana
              </p>
            </div>
            <Switch
              checked={requireApprovalPastWindow}
              onCheckedChange={setRequireApprovalPastWindow}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Alertas de cap
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Warning (%)</Label>
              <Input type="number" value={capWarningPercent} onChange={(e) => setCapWarningPercent(e.target.value)} className="w-24" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Crítico (%)</Label>
              <Input type="number" value={capCriticalPercent} onChange={(e) => setCapCriticalPercent(e.target.value)} className="w-24" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Fee: alerta amarilla al {capWarningPercent}%, roja al {capCriticalPercent}%.
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full cursor-pointer">
        {saving ? "Guardando..." : "Guardar configuración"}
      </Button>
    </div>
  )
}
