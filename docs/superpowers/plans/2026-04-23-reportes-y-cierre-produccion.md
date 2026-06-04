# Reportes y Cierre de Producción Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sumar reportes operativos útiles, filtros por rango reales en dashboard y un cierre visual/operativo para producción sin romper el flujo diario del local.

**Architecture:** se extiende el panel existente con una vista de reportes y consultas agregadas livianas sobre Supabase. El dashboard mantiene su foco operativo, pero incorpora filtros de rango coherentes y mejor contexto visual. Los exports se centralizan en una API más rica por módulo.

**Tech Stack:** Next.js App Router, Server Components, Server Actions, Supabase/Postgres, Vitest, Tailwind.

---

### Task 1: Dashboard con rango real

**Files:**
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\dashboard\queries.ts`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\dashboard\components\dashboard-overview.tsx`
- Test: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\dashboard\range.test.ts`

- [ ] Parsear correctamente fechas `from/to` como inicio/fin de día.
- [ ] Ajustar métricas para que respondan al rango elegido.
- [ ] Agregar formulario de filtro visible y reseteo rápido.
- [ ] Verificar con tests de helper de rango.

### Task 2: Bloque de reportes

**Files:**
- Create: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\app\(admin)\reportes\page.tsx`
- Create: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\reports\queries.ts`
- Create: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\reports\components\reports-view.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\lib\navigation.ts`

- [ ] Crear página de reportes con acceso desde sidebar.
- [ ] Mostrar resúmenes por vendedor y técnico.
- [ ] Agregar exportaciones por módulo con rango.

### Task 3: Exportaciones limpias por módulo

**Files:**
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\app\api\reportes\[tipo]\route.ts`

- [ ] Soportar `ventas`, `gastos`, `reparaciones`, `facturacion` y `caja`.
- [ ] Mejorar nombres de columnas y archivos exportados.

### Task 4: Revisión visual y operativa final

**Files:**
- Modify: componentes UI puntuales según hallazgos.

- [ ] Afinar textos visibles del panel.
- [ ] Mejorar legibilidad móvil en dashboard/reportes.
- [ ] Revalidar con `npm test`, `npm run typecheck`, `npm run build`.
