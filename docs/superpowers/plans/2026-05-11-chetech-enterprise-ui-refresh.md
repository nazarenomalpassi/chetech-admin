# Chetech Enterprise UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar todo el frontend de CHETECH hacia una experiencia SaaS/Enterprise moderna sin romper la lógica operativa diaria.

**Architecture:** La mejora se apoya primero en tokens globales, componentes compartidos y shell visual del panel; luego se aplica a dashboard, tablas, formularios y navegación para que el cambio sea consistente entre módulos. Se preserva toda la lógica de Supabase, acciones de servidor y permisos existentes.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Supabase.

---

### Task 1: Reforzar design system base

**Files:**
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\app\globals.css`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\tailwind.config.ts`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\ui\button.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\ui\card.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\ui\input.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\ui\badge.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\ui\select.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\ui\textarea.tsx`

- [ ] Crear una capa de tokens visuales enterprise: superficies, bordes, tipografía, sombras y colores financieros.
- [ ] Mejorar estados hover, focus, disabled y motion en botones, inputs, badges y contenedores.
- [ ] Verificar que las clases nuevas no rompan formularios existentes.

### Task 2: Rehacer shell del panel

**Files:**
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\app\(admin)\layout.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\layout\sidebar.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\components\layout\topbar.tsx`

- [ ] Reordenar la jerarquía visual del layout para escritorio y mobile.
- [ ] Modernizar el sidebar para que tenga mejor lectura, estados activos más premium y menor ruido visual.
- [ ] Replantear el topbar con mejor composición, búsqueda más usable y presencia de marca más sobria.

### Task 3: Modernizar dashboard y patrones de lectura

**Files:**
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\dashboard\components\dashboard-overview.tsx`

- [ ] Rediseñar KPIs, bloque de filtro y tarjetas de resumen con jerarquía tipo SaaS/Enterprise.
- [ ] Mejorar presentación de stock bajo, cuentas y top productos.
- [ ] Añadir micro-interacciones suaves y mejores estados vacíos.

### Task 4: Unificar tablas, filtros y formularios operativos

**Files:**
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\products\components\products-view.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\products\components\product-table.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\products\components\product-filters.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\products\components\product-form-dialog.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\sales\components\sales-list.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\expenses\components\expenses-list.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\repairs\components\repairs-list.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\invoices\components\invoices-view.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\tv-boards\components\boards-view.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\tv-boards\components\board-table.tsx`
- Modify: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\src\features\tv-boards\components\board-form-dialog.tsx`

- [ ] Aplicar un patrón consistente de encabezado, filtros, tablas y estados.
- [ ] Hacer formularios más rápidos de leer y operar.
- [ ] Mejorar tables para desktop y mobile sin perder funcionalidad.

### Task 5: Validación y cierre

**Files:**
- Verify only

- [ ] Correr `npm test`
- [ ] Correr `npm run typecheck`
- [ ] Correr `npm run build`
- [ ] Ajustar cualquier regresión visual o tipográfica detectada durante la validación.
