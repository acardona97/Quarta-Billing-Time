"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Settings, Clock, Bell, Palette } from "lucide-react"

export default function PreferencesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [dailyGoalHours, setDailyGoalHours] = useState("6")
  const [editWindowDays, setEditWindowDays] = useState("7")
  const [reconciliationTime, setReconciliationTime] = useState("17:30")
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [theme, setTheme] = useState("system")

  useEffect(() => {
    loadPreferences()
  }, [])

  async function loadPreferences() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (data) {
      setDailyGoalHours(String((data.daily_goal_minutes || 360) / 60))
      setEditWindowDays(String(data.self_edit_window_days || 7))
      setReconciliationTime(data.reconciliation_time || "17:30")
      setNotificationsEnabled(data.notifications_enabled ?? true)
      setTheme(data.theme || "system")
    }
  }

  async function savePreferences() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        daily_goal_minutes: parseFloat(dailyGoalHours) * 60,
        self_edit_window_days: parseInt(editWindowDays),
        reconciliation_time: reconciliationTime,
        notifications_enabled: notificationsEnabled,
        theme,
      })

    setLoading(false)

    if (error) {
      toast.error("Error guardando preferencias")
    } else {
      toast.success("Preferencias guardadas")
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Preferencias
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Personaliza tu experiencia
        </p>
      </div>

      {/* Productivity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Productividad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Meta diaria (horas)
            </Label>
            <Input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={dailyGoalHours}
              onChange={(e) => setDailyGoalHours(e.target.value)}
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Se muestra en tu dashboard y modo viernes
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Ventana de auto-edición (días)
            </Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={editWindowDays}
              onChange={(e) => setEditWindowDays(e.target.value)}
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Puedes editar tus entradas dentro de este período sin aprobación
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notificaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recordatorio diario</p>
              <p className="text-[11px] text-muted-foreground">
                Notificación para completar horas del día
              </p>
            </div>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
          </div>

          {notificationsEnabled && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Hora de recordatorio
              </Label>
              <Input
                type="time"
                value={reconciliationTime}
                onChange={(e) => setReconciliationTime(e.target.value)}
                className="w-32"
              />
              <p className="text-[11px] text-muted-foreground">
                Hora Bogotá (default: 5:30 PM)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Apariencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tema</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v ?? "system")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Oscuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={savePreferences}
        disabled={loading}
        className="w-full cursor-pointer"
      >
        {loading ? "Guardando..." : "Guardar preferencias"}
      </Button>
    </div>
  )
}
