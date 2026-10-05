# Roles y permisos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar de forma segura la experiencia y las capacidades de administradores y técnicos sin romper los flujos operativos existentes.

**Architecture:** `profiles.role` será la fuente de verdad con valores `admin` y `tecnico`. Una matriz central de permisos filtrará navegación, protegerá páginas y validará acciones; Supabase RLS aplicará la misma separación y triggers limitarán las columnas que un técnico puede cambiar en reparaciones y visitas.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, Supabase Auth/PostgreSQL/RLS, Vitest y Tailwind CSS.

---

### Task 1: Modelo central de autorización

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/db/types.ts`
- Test: `src/lib/permissions.test.ts`

- [ ] Definir `AppRole`, `AppPermission`, matriz por rol, permisos de rutas y filtros de navegación.
- [ ] Escribir pruebas para admin, técnico, rutas permitidas y rutas administrativas rechazadas.
- [ ] Agregar `requirePermission` basado en el perfil autenticado y usar `tecnico` como fallback seguro.

### Task 2: Navegación y protección de rutas

**Files:**
- Modify: `src/lib/navigation.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-navigation.tsx`
- Modify: `src/app/(admin)/layout.tsx`
- Modify: `src/lib/supabase/middleware.ts`
- Modify: páginas dentro de `src/app/(admin)/*/page.tsx`
- Test: `src/lib/navigation.test.ts`

- [ ] Mostrar al técnico solo Dashboard, Productos, Visitas y Reparaciones.
- [ ] Resolver el perfil en el layout de servidor para evitar destellos del menú administrativo.
- [ ] Bloquear URL directa en middleware y repetir la autorización antes de consultar datos en cada página.

### Task 3: Dashboard técnico y consultas mínimas

**Files:**
- Create: `src/features/dashboard/technician-queries.ts`
- Create: `src/features/dashboard/components/technician-dashboard.tsx`
- Modify: `src/app/(admin)/dashboard/page.tsx`
- Test: `src/features/dashboard/technician-dashboard.test.ts`

- [ ] Consultar únicamente estados de reparaciones, asignaciones y visitas del día.
- [ ] Renderizar métricas técnicas sin ventas, gastos, caja, sueldos ni ganancias.
- [ ] Mantener el dashboard administrativo actual sin cambios funcionales.

### Task 4: Capacidades operativas de técnico

**Files:**
- Modify: `src/features/products/queries.ts`
- Modify: `src/features/products/components/product-table.tsx`
- Modify: `src/features/products/components/products-view.tsx`
- Modify: `src/features/visits/actions.ts`
- Modify: `src/features/visits/components/visits-view.tsx`
- Modify: `src/features/repairs-access/actions.ts`
- Modify: `src/features/repairs-access/queries.ts`

- [ ] Mantener Productos en consulta y ocultar costo/margen y acciones de modificación al técnico.
- [ ] Reservar alta/edición completa/eliminación de Visitas al admin y permitir al técnico estado/observaciones.
- [ ] Reservar ingreso y ficha administrativa de Reparaciones al admin, manteniendo actualización de taller para técnico.
- [ ] Evitar consultas administrativas de clientes/importaciones cuando ingresa un técnico.

### Task 5: Acciones administrativas del servidor

**Files:**
- Modify: acciones de Ventas, Gastos, Facturación, Cuotas, Caja, Sueldos, Placas, Balance, Pagos de reparaciones, Tercerizaciones y Configuración.
- Modify: route handlers de PDF, reportes, backup y SKU.
- Test: pruebas de permisos por acción en los módulos críticos.

- [ ] Reemplazar `requireUser` por permisos administrativos donde la operación no pertenece al técnico.
- [ ] Mantener solo reparaciones de taller y actualización técnica de visitas como escrituras autorizadas.

### Task 6: Migración y RLS

**Files:**
- Create: `supabase/migrations/*_technician_role_permissions.sql`

- [ ] Migrar `empleado` a `tecnico`, conservar admins, completar perfiles faltantes y cambiar el trigger de nuevos usuarios.
- [ ] Crear helper privado de rol con `security definer`, `search_path` seguro y permisos mínimos.
- [ ] Reemplazar políticas abiertas por políticas admin/técnico por tabla.
- [ ] Agregar triggers que impidan a técnicos alterar columnas administrativas en `repair_access_orders` y `visits`.
- [ ] Aplicar la migración y verificar roles, políticas y asesores de seguridad.

### Task 7: Verificación y despliegue

**Files:**
- Test: suite Vitest y pruebas responsivas autenticadas.

- [ ] Probar login y navegación como admin y técnico.
- [ ] Probar bloqueo por URL y acciones directas no autorizadas.
- [ ] Probar actualización permitida de reparación y visita, y consulta de productos.
- [ ] Ejecutar `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.
- [ ] Desplegar a Vercel y validar el dominio de producción.
