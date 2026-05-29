# QUARTA BILLING TIME — Documento de Handoff

**Fecha**: 2026-05-28
**Proyecto**: Plataforma de Time Tracking & Billing para Quarta Acompañamiento de Negocios
**Ubicación**: `C:\Users\User\Desktop\quarta-billing-time\`

---

## 1. Contexto del Negocio

Quarta es una firma de abogados en Medellín, Colombia. Actualmente no tienen herramienta formal de registro de horas — usan Excel y memoria. El gap real: los abogados registran 4-5h/día vs. 7h ideales, lo que significa ~30% de revenue perdido por hora no capturada.

**Objetivo central**: Herramienta tan fácil y rápida que el abogado NO le tenga pereza. Cero enforcement inicial — adopción por UX, no por obligación.

### Usuarios

| Usuario | Rol | Acceso |
|---------|-----|--------|
| Esteban | `super_admin` | Todo — dashboard ejecutivo, reportes, auditoría |
| Andrés | `partner_admin` | Todo — igual que Esteban |
| Lina | `attorney` | Solo sus clientes y entradas |
| Ana María | `attorney` | Solo sus clientes y entradas |
| María Fernanda | `attorney` | Solo sus clientes y entradas |
| María Antonia | `attorney` | Solo sus clientes y entradas |
| Sofía | `attorney` | Solo sus clientes y entradas |

### Modelo de Facturación

- **Paquete / Fee**: Cliente paga fee mensual por X horas incluidas. Tiene `monthly_hour_cap`.
- **Cobro por horas (Hourly)**: Cada hora se factura individualmente con tarifa.
- **Proyecto**: Tarifa fija por servicio específico.

Un cliente puede tener múltiples asuntos (matters), cada uno con su propia modalidad.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.2.6 |
| UI Components | shadcn/ui + @base-ui/react | Latest |
| Styling | Tailwind CSS | 4.x |
| Database | Supabase (PostgreSQL) | Cloud |
| Auth | Supabase Auth (email/password) | Built-in |
| Charts | Recharts | — |
| Excel Export | SheetJS (xlsx) | — |
| Language | TypeScript (strict) | 5.x |
| Deployment | Vercel (frontend) + Supabase Cloud | — |

### Nota sobre @base-ui/react

Este proyecto usa `@base-ui/react` que reemplaza Radix. Diferencia clave: usa prop `render` en vez de `asChild`.

```tsx
// Correcto (@base-ui/react)
<DialogTrigger render={<Button />}>Click</DialogTrigger>

// Incorrecto (Radix viejo)
<DialogTrigger asChild><Button>Click</Button></DialogTrigger>
```

---

## 3. Arquitectura de Datos — Regla de Aislamiento

### Principio fundamental

```
ABOGADO ve SOLO sus propios datos.
ADMIN ve TODO pero SOLO a través del panel de Abogados/Reportes.
En "Mis Clientes" y "Mis Entradas", INCLUSO los admins ven solo LO SUYO.
```

### Implementación

| Vista | Filtro de datos | Razón |
|-------|----------------|-------|
| Mis Clientes | `user_client_assignments.user_id = auth.uid()` + `time_entries.user_id = auth.uid()` | Cada abogado ve solo sus clientes asignados y solo SUS horas |
| Mis Entradas | `time_entries.user_id = auth.uid()` | Solo mis entradas, filtro de clientes también por mis asignaciones |
| Dashboard personal | `time_entries.user_id = auth.uid()` | Solo mis métricas |
| Admin > Abogados | Sin filtro de user_id en entries | Admin ve todas las horas de todos |
| Admin > Reportes | Sin filtro de user_id | Reportes de toda la firma |

### Clientes compartidos

Múltiples abogados pueden trabajar para el mismo cliente. Ejemplo:
- Lina tiene asignado "Empresa X" → ve solo SUS horas para Empresa X
- Ana tiene asignado "Empresa X" → ve solo SUS horas para Empresa X
- Esteban en Admin > Abogados → ve horas de AMBAS para Empresa X
- Cap del paquete en Admin = total de TODOS los abogados combinados

### Tabla clave: `user_client_assignments`

```sql
user_client_assignments (
  user_id    → users.id (= auth.uid())
  client_id  → clients.id
  is_active  → boolean
)
```

El código NO depende de RLS para aislamiento de clientes (RLS da a admins TODOS los clientes). En cambio, filtra explícitamente en el código de la app a través de `user_client_assignments`.

---

## 4. Problema Crítico Resuelto: users.id vs auth.uid()

### El bug

La tabla `users.id` usaba `gen_random_uuid()` — un UUID diferente al de `auth.users.id`. Pero TODAS las políticas RLS verifican `user_id = auth.uid()`. Cuando la app insertaba `user_id = profile.id` (UUID de users), RLS bloqueaba silenciosamente todo.

### La solución

**Migración 006** (`supabase/migrations/006_sync_users_auth_id.sql`):
1. Crea tabla temporal mapeando users.id viejo → auth.users.id por email
2. Actualiza TODAS las FK references en todas las tablas
3. Cambia users.id para que coincida con auth.users.id
4. Crea trigger `handle_new_user()` para futuros signups

**Cambio en layout/page**: Query cambió de `.eq("email", user.email)` a `.eq("id", user.id)`.

### Estado: PENDIENTE DE EJECUTAR

> **ACCIÓN REQUERIDA**: Ejecutar migración 006 manualmente en Supabase SQL Editor.
> Sin esto, las inserciones de time_entries fallarán silenciosamente.

---

## 5. Problema Resuelto: Eliminación de Clientes

### El bug

Foreign keys sin `ON DELETE CASCADE` en `timer_sessions.client_id` y `timer_sessions.matter_id` bloqueaban la eliminación.

### La solución

1. **Código**: `handleDelete()` en clients page ahora limpia explícitamente todas las tablas FK antes de eliminar:
   - timer_sessions, suggested_captures, activity_signals
   - time_entries, matters, client_contacts, client_billing_profiles
   - client_default_rates, user_client_assignments
   - Finalmente: clients

2. **Migración 007** (`supabase/migrations/007_cascade_client_fk.sql`):
   - `timer_sessions.client_id/matter_id` → ON DELETE CASCADE
   - `activity_signals.matched_client_id/matter_id` → ON DELETE SET NULL
   - `suggested_captures.suggested_client_id/matter_id` → ON DELETE SET NULL

### Estado: PENDIENTE DE EJECUTAR

> **ACCIÓN REQUERIDA**: Ejecutar migración 007 manualmente en Supabase SQL Editor.

---

## 6. Flujo de Integración Completo

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   TIMER      │────▶│ QUICK ENTRY  │────▶│ time_entries  │
│ (cronómetro) │stop │   (modal)    │save │   (DB)       │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                          dispatch event         │
                     "time-entry-created"        │
                                                 │
                    ┌────────────────────────────┤
                    ▼                            ▼
            ┌──────────────┐           ┌──────────────┐
            │ Mis Clientes │           │ Mis Entradas │
            │ (cap update) │           │  (reload)    │
            └──────────────┘           └──────────────┘
                    │                            │
                    ▼                            ▼
            ┌──────────────┐           ┌──────────────┐
            │   Admin      │           │   Admin      │
            │  Abogados    │           │  Reportes    │
            └──────────────┘           └──────────────┘
```

### Evento personalizado: `time-entry-created`

Disparado por:
- Quick Entry modal después de INSERT exitoso
- Clients page `addMatter()` cuando se asignan horas (horas = trabajo YA realizado)

Escuchado por:
- Clients page → `loadClients()` (recarga caps)
- Entries page → `loadEntries()` (recarga lista)

### Timer → Quick Entry (React Context)

```
QuickEntryProvider (context)
  └── openFromTimer({ clientId, matterId, durationMinutes, realSeconds, source: "timer" })
       └── QuickEntryModal abre pre-filled con datos del timer
```

### Matemáticas del Timer

```typescript
// Tiempo total = acumulado de pausas anteriores + tiempo desde último resume
function getElapsedSeconds(timer): number {
  if (!timer.is_running || timer.paused_at) return timer.accumulated_seconds
  const sinceResume = Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000)
  return timer.accumulated_seconds + sinceResume
}
```

- `accumulated_seconds`: Se actualiza en cada PAUSE con el total acumulado
- `started_at`: Se resetea en cada RESUME
- Sync a DB cada 30 segundos vía interval
- `timersRef` pattern para evitar stale closures en el interval

---

## 7. Estructura de Archivos Clave

```
app/
├── (auth)/login/page.tsx              — Login (email/password)
├── (dashboard)/
│   ├── layout.tsx                     — Auth guard + AppShell wrapper
│   ├── page.tsx                       — Dashboard personal del abogado
│   ├── clients/page.tsx               — Mis Clientes (aislado por usuario)
│   ├── entries/page.tsx               — Mis Entradas (aislado por usuario)
│   ├── timers/page.tsx                — Vista de timers
│   └── admin/
│       ├── attorneys/page.tsx         — Panel de abogados (click → ver clientes)
│       ├── reports/page.tsx           — Reportes Excel (5 tipos)
│       └── dashboard/page.tsx         — Dashboard ejecutivo

components/
├── app-shell.tsx                      — Layout con sidebar + QuickEntryProvider
├── quick-entry/
│   ├── quick-entry-modal.tsx          — Modal de registro rápido
│   ├── client-selector.tsx            — Popover+Command selector
│   ├── matter-selector.tsx            — Popover+Command selector (muestra nombres)
│   └── duration-input.tsx             — Input con quick buttons
├── timers/
│   └── timer-widget.tsx               — Play/Pause/Stop widget
└── dashboard/
    └── dashboard-content.tsx          — Widgets del dashboard

lib/
├── supabase/client.ts                 — Browser client
├── supabase/server.ts                 — Server component client
├── hooks/use-timer.ts                 — Lógica completa de timers
├── context/quick-entry-context.tsx    — React context timer→QuickEntry
├── utils/duration.ts                  — formatDuration, roundToBillingIncrement
├── utils/date.ts                      — todayBogota, startOfWeek/Month, timezone helpers
├── utils/rate-resolver.ts             — Resolución de tarifa (matter > client > default)
├── types.ts                           — Interfaces TypeScript + constantes billing
└── constants.ts                       — Categorías, etc.

supabase/
├── migrations/
│   ├── 001_initial_schema.sql         — Schema completo
│   ├── 002_rls_policies.sql           — Row Level Security
│   ├── 006_sync_users_auth_id.sql     — ⚠️ PENDIENTE — Sync users.id con auth.uid()
│   └── 007_cascade_client_fk.sql      — ⚠️ PENDIENTE — ON DELETE CASCADE
└── seed.sql                           — Datos iniciales
```

---

## 8. Lo que está CONSTRUIDO (Phase 1 — En Progreso)

### Completado

- [x] Proyecto Next.js 16 + Tailwind + shadcn/ui + TypeScript
- [x] Supabase setup con schema completo
- [x] Auth email/password con restricción @quarta.co
- [x] RLS policies en todas las tablas
- [x] Layout con sidebar colapsable (branding Quarta — bird icon + navy theme)
- [x] Quick Entry modal (< 15 segundos, todos los campos)
- [x] Client selector con búsqueda + Popover/Command
- [x] Matter selector (muestra nombres, no UUIDs, con badges de billing type)
- [x] Duration input con quick buttons
- [x] Category chips opcionales
- [x] Timers múltiples simultáneos (play/pause/stop)
- [x] Timer persistence en DB (sync cada 30s)
- [x] Timer → Quick Entry pre-filled al parar
- [x] Dashboard personal (hoy/semana/mes, progress bar, streak, recientes, timers activos)
- [x] Mis Clientes — aislado por abogado
- [x] CRUD matters con billing type (Paquete/Hourly/Proyecto)
- [x] Cap progress bar para clientes fee
- [x] Horas en matter → auto-create time_entry (INTERPRETACIÓN B)
- [x] Eliminación de clientes con cleanup de FKs
- [x] Mis Entradas — filtros, edición inline, export Excel
- [x] Aislamiento de datos (cada abogado ve solo lo suyo)
- [x] Admin > Abogados — cards con stats + click para ver clientes del abogado
- [x] Admin > Abogados — muestra horas del abogado + total equipo por cliente
- [x] Admin > Reportes — 5 tipos de reporte Excel:
  - Horas por abogado
  - Horas por cliente
  - Matriz Abogados × Clientes (nuevo)
  - Consumo de paquete (con detalle por abogado)
  - Pre-factura
- [x] Quick period buttons en reportes (Hoy/Semana/Mes)
- [x] Custom event `time-entry-created` para comunicación entre componentes
- [x] Labels en español (Paquete, Por horas, Cobro por horas — no "Pospago")
- [x] Migración 006 preparada (sync users.id)
- [x] Migración 007 preparada (cascade deletes)

### Pendiente — Acciones Inmediatas

- [ ] **EJECUTAR migración 006** en Supabase SQL Editor
- [ ] **EJECUTAR migración 007** en Supabase SQL Editor
- [ ] Verificar end-to-end después de migraciones

### Pendiente — Phase 1 Restante

- [ ] Admin Dashboard ejecutivo (charts con Recharts — donut billable, ranking productividad, top clients, source distribution)
- [ ] Admin > Vista por cliente (consumo vs cap con proyección, breakdown por matter, todos los abogados)
- [ ] Hour Cap Alerts (80% warning, 100% alerta, >100% confirmación)
- [ ] Keyboard shortcuts (Ctrl+Shift+T = Quick Entry, Ctrl+Shift+S = Timer)
- [ ] Reconciliación diaria 5:30 PM (notificación in-app)
- [ ] Modo viernes (vista semanal con gaps visibles, quick fill)
- [ ] Notification center in-app
- [ ] Gamification (streak tracking real, "mejor semana", micro-animaciones)
- [ ] Audit events logging
- [ ] User preferences page (meta diaria, theme, notificaciones)
- [ ] Responsive móvil
- [ ] Sentry error monitoring
- [ ] Tests (Vitest unit + Playwright E2E)
- [ ] Deploy Vercel + Supabase Cloud

---

## 9. Phases Futuras

### Phase 2: Microsoft 365 Integration
- Outlook calendar → sugerencias de tiempo automáticas
- Teams meetings → detección de reuniones
- Azure AD app registration (guía step-by-step para Esteban)
- Anti-noise filters para emails/reuniones irrelevantes
- Schema `integration_*` ya creado (vacío, listo)

### Phase 3: Activity Intelligence
- Desktop activity signals (app usage tracking)
- Sugerencias de captura automáticas
- Pattern recognition (horarios habituales del abogado)

### Phase 4: Billing Workflow + AI Copilot
- Draft → Reviewed → Approved → Invoiced pipeline
- AI: auto-categorización de entradas
- AI: sugerencias de descripción
- AI: detección de anomalías (horas inusuales)

### Phase 5: SIIGO Integration
- Conexión con sistema contable colombiano
- Facturación electrónica automática
- Sincronización de clientes/facturas

### Futuro
- Quick Entry por voz (móvil post-reunión)
- Desktop companion app (eliminado de MVP, posible post-adopción)

---

## 10. Configuración del Entorno

### Variables de entorno necesarias (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Comandos

```bash
# Desarrollo
npm run dev

# Build
npm run build

# TypeScript check
npx tsc --noEmit
```

### Supabase

- URL del proyecto: (configurar en .env.local)
- Auth: email/password, dominio @quarta.co
- RLS: activado en todas las tablas
- Migraciones pendientes: 006, 007 (ejecutar manualmente en SQL Editor)

---

## 11. Decisiones de Diseño Importantes

| Decisión | Valor | Razón |
|----------|-------|-------|
| Ventana auto-edición | 7 días | Soporta "modo viernes" sin castigar |
| Horas en matter = trabajo ya hecho | Sí (Interpretación B) | Crea time_entry + actualiza cap inmediatamente |
| Aislamiento en app code vs RLS | App code | RLS da admins todo; app filtra por assignments |
| Categorías | Opcionales | Para abogados que quieran detalle |
| Timer sync | 30 segundos | Balance entre responsividad y carga |
| Matter selector | Popover+Command | Base UI Select mostraba UUIDs; necesitaba control total |
| Cap en vista attorney | Solo MIS horas | Aislamiento; admin ve total |
| Cap en vista admin | TODAS las horas | Admin necesita ver consumo real del paquete |
| Labels | Español neutro (Paquete, Por horas) | NO "Pospago", NO inglés |

---

## 12. Branding

- **Logo**: Bird/arrow icon en cyan/teal (#0099CC aprox.) + "quarta" lowercase
- **Sidebar**: Navy dark (#1a2332)
- **Accent**: Teal/cyan del bird icon
- **Background**: Light grays
- **Font**: DM Sans
- **Tone**: Profesional moderno, no corporativo frío

---

## 13. Instrucciones para Continuar Desarrollo

### Paso inmediato: Ejecutar migraciones

1. Abrir Supabase Dashboard > SQL Editor
2. Copiar y ejecutar contenido de `supabase/migrations/006_sync_users_auth_id.sql`
3. Verificar que no hay errores
4. Copiar y ejecutar contenido de `supabase/migrations/007_cascade_client_fk.sql`
5. Verificar que no hay errores
6. Probar: crear time_entry desde Quick Entry → debe aparecer en Mis Entradas

### Para retomar desarrollo

1. Abrir terminal en `C:\Users\User\Desktop\quarta-billing-time\`
2. `npm run dev`
3. Navegar a `http://localhost:3000`
4. Login con usuario @quarta.co
5. Verificar que las páginas cargan datos correctamente

### Próxima prioridad de construcción

1. Admin Dashboard ejecutivo (charts)
2. Hour Cap Alerts
3. Keyboard shortcuts
4. Reconciliación diaria
5. Modo viernes
6. Responsive
7. Tests + Deploy

---

*Documento generado el 2026-05-28. Refleja el estado actual del proyecto incluyendo todas las correcciones de bugs y features implementadas.*
