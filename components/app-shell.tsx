"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { User, TimerSession } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { QuartaIcon } from "@/components/brand/quarta-logo"
import { QuickEntryModal } from "@/components/quick-entry/quick-entry-modal"
import { TimerBar } from "@/components/timers/timer-bar"
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut"
import { secondsToBillingMinutes } from "@/lib/utils/duration"
import { QuickEntryProvider } from "@/lib/context/quick-entry-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Timer,
  FileText,
  Users,
  FolderOpen,
  Bell,
  Settings,
  BarChart3,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  CalendarCheck,
  UserCircle,
  PanelLeft,
} from "lucide-react"

interface AppShellProps {
  user: User
  children: React.ReactNode
}

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  adminOnly?: boolean
  superAdminOnly?: boolean
}

const attorneyNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timers", label: "Cronómetros", icon: Timer },
  { href: "/entries", label: "Mis Entradas", icon: FileText },
  { href: "/clients", label: "Mis Clientes", icon: Building2 },
  { href: "/reconciliation", label: "Resumen Semanal", icon: CalendarCheck },
  { href: "/notifications", label: "Notificaciones", icon: Bell },
]

const adminNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Panel Ejecutivo", icon: BarChart3, adminOnly: true },
  { href: "/admin/attorneys", label: "Abogados", icon: Users, adminOnly: true },
  { href: "/admin/clients", label: "Todos los Clientes", icon: Building2, adminOnly: true },
  { href: "/admin/reports", label: "Reportes", icon: FileText, adminOnly: true },
  { href: "/admin/audit", label: "Auditoría", icon: Shield, superAdminOnly: true },
  { href: "/admin/settings", label: "Configuración", icon: Settings, superAdminOnly: true },
]

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [quickEntryPrefill, setQuickEntryPrefill] = useState<{
    clientId?: string
    matterId?: string
    durationMinutes?: number
    realSeconds?: number
    description?: string
    category?: string
    source?: string
  } | undefined>(undefined)

  // Keyboard shortcuts
  useKeyboardShortcut("t", true, true, () => setQuickEntryOpen(true))

  const handleTimerStop = useCallback((timer: TimerSession) => {
    openFromTimer(timer)
  }, [])

  const openQuickEntry = useCallback((prefill?: typeof quickEntryPrefill) => {
    if (prefill) setQuickEntryPrefill(prefill)
    setQuickEntryOpen(true)
  }, [])

  const openFromTimer = useCallback((timer: TimerSession) => {
    setQuickEntryPrefill({
      clientId: timer.client_id || undefined,
      matterId: timer.matter_id || undefined,
      durationMinutes: secondsToBillingMinutes(timer.accumulated_seconds),
      realSeconds: timer.accumulated_seconds,
      description: timer.description || undefined,
      category: timer.category || undefined,
      source: "timer",
    })
    setQuickEntryOpen(true)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved === "true") setCollapsed(true)
  }, [])

  function toggleCollapse() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem("sidebar-collapsed", String(next))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const isAdmin = user.role === "super_admin" || user.role === "partner_admin"
  const isSuperAdmin = user.role === "super_admin"

  const filteredAdminNav = adminNav.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin
    if (item.adminOnly) return isAdmin
    return true
  })

  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden gradient-main">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 ease-out",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center h-14 px-3 border-b border-sidebar-border",
          collapsed ? "justify-center" : "justify-between"
        )}>
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <QuartaIcon className="flex-shrink-0 w-7 h-7 text-[var(--quarta-blue)]" />
            {!collapsed && (
              <div className="min-w-0">
                <span className="font-semibold text-sm truncate tracking-tight">quarta</span>
                <p className="text-[9px] text-sidebar-foreground/40 leading-tight -mt-0.5 truncate">billing time</p>
              </div>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer flex-shrink-0"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {/* Attorney section */}
          {!collapsed && (
            <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Personal
            </p>
          )}
          {attorneyNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}

          {/* Admin section */}
          {isAdmin && (
            <>
              {!collapsed && (
                <p className="px-2 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  Administración
                </p>
              )}
              {collapsed && <div className="my-2 mx-2 border-t border-sidebar-border" />}
              {filteredAdminNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                />
              ))}
            </>
          )}
        </nav>

        {/* User menu */}
        <div className={cn(
          "border-t border-sidebar-border p-2",
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className={cn(
                    "flex items-center gap-2 w-full rounded-md p-2 text-sm transition-colors hover:bg-sidebar-accent cursor-pointer",
                    collapsed && "justify-center"
                  )}
                />
              }
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 text-left">
                  <p className="text-xs font-medium truncate text-sidebar-foreground">
                    {user.full_name}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">
                    {user.role === "super_admin" ? "Super Admin" : user.role === "partner_admin" ? "Partner" : "Abogado"}
                  </p>
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side={collapsed ? "right" : "top"} className="w-48">
              <DropdownMenuItem render={<Link href="/preferences" />} className="cursor-pointer">
                <UserCircle className="mr-2 h-4 w-4" />
                Preferencias
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TimerBar
          userId={user.id}
          onStop={handleTimerStop}
          onStartNew={() => {}}
        />
        <main className="flex-1 overflow-y-auto">
          <QuickEntryProvider value={{ openQuickEntry, openFromTimer }}>
            {children}
          </QuickEntryProvider>
        </main>
      </div>

      {/* Quick Entry Modal — global */}
      <QuickEntryModal
        open={quickEntryOpen}
        onOpenChange={(open) => {
          setQuickEntryOpen(open)
          if (!open) setQuickEntryPrefill(undefined)
        }}
        userId={user.id}
        prefillData={quickEntryPrefill}
      />
    </div>
  )
}

function NavLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
}) {
  const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))

  const linkContent = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors cursor-pointer",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
        collapsed && "justify-center px-0"
      )}
    >
      <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-sidebar-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={linkContent} />
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return linkContent
}
