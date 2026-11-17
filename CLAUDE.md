# CheTech Admin: instrucciones para agentes

Sistema de gestión de un taller técnico y local de tecnología: reparaciones, ventas, caja, gastos, sueldos y comprobantes. Lo usan todos los días el dueño (administrador) y los técnicos, en la PC del mostrador y en celulares.

## Stack y entornos

- Next.js 15 (App Router), React 19, TypeScript estricto, Tailwind CSS 3 y Supabase (PostgreSQL 17, Auth, Storage).
- Producción: https://chetech-admin.vercel.app (proyecto de Vercel `chetech-admin`, región `gru1`). **Cada commit en `main` se publica solo.** Cada rama genera una vista previa.
- Base de datos: proyecto de Supabase `chetechweb` (`sa-east-1`). La comparte la tienda online, que es otro repo y otro proyecto de Vercel (`chetech-tienda`). Antes de cambiar tablas `storefront_*`, `customer_*` o `consumer_*`, o funciones `get_storefront_*`, `submit_consumer_request` y las del portal de clientes, revisá el impacto en la tienda.

## Comandos

```bash
npm run lint
npm run typecheck
npm test            # Vitest; las pruebas de base de datos son opcionales (ver docs/operations/staging.md)
npm run build
```

## Plan de mejora en curso

Documento con el diagnóstico, las seis etapas y sus criterios de salida: https://claude.ai/artifact/Eef6gz9ZgTGuG4SeJ8ckoG

Decisiones del dueño, tomadas el 17/11/2026:

- Todo el trabajo se acumula en la rama `mejora/plan-integral`. **No se mergea a `main` hasta terminar todas las etapas**: el pase a producción es uno solo, al final.
- Se pueden aplicar migraciones en producción, incluida la unificación de cobros, **solo en ese pase final** y después de un respaldo completo y verificado (`docs/operations/backup-restore.md`).
- El taller pasa a `/taller`: mesa de trabajo, `ordenes/[id]`, `nueva`, `garantias`, `repuestos`, `metricas`, `clientes` y `cobros`. Las rutas viejas redirigen a las nuevas y `/q/[id]` no cambia.
- Componentes: shadcn/ui sobre Base UI, adaptados a la marca. Tailwind 4 con los tokens definidos en CSS.
- Cuotas sale del menú y del Dashboard. Pedidos queda solo con la reposición de productos, porque Sueldo la usa.
- Un usuario por persona; las cuentas las crea el dueño.
- Sin modo oscuro por ahora; los tokens quedan preparados.
- Este repo es dueño del esquema de la base; la tienda consume funciones acordadas.

## Reglas que no se tocan

- Cobros, caja, stock, garantías y numeración REP se resuelven en funciones SQL atómicas: se llaman, no se reimplementan en TypeScript.
- Se conservan el control de versión y los reintentos idempotentes de los guardados del taller, los borradores locales y los avisos de cambios sin guardar.
- Permisos de administrador y técnico (`src/lib/permissions.ts`), validados en el servidor y con RLS.
- El repo es público: nada de secretos, datos de clientes ni cifras del negocio en el código, los commits o la documentación.
- Dirección visual en `.impeccable.md`: grafito, gris y blanco papel; color solo para estados con significado.

## Forma de trabajar

- Antes de cada commit: lint, typecheck, test y build sin errores. CI (`.github/workflows/ci.yml`) repite lo mismo en cada push.
- Commits chicos, uno por tarea, en español, que digan qué cambia para quien usa el sistema.
- Migraciones nuevas en `supabase/migrations/<timestamp>_<nombre>.sql`, idempotentes y aditivas cuando se pueda. Se escriben durante el plan y se aplican juntas, en orden, en el pase final.
- Interfaz en español rioplatense, con tildes y voseo. Glosario: "Taller" (nunca "Reparaciones Access"), "Cobros" (no "Pagos de reparaciones"), "orden" y "REP-000000".
- Al cerrar una tarea, marcala en el documento del plan y en la sección siguiente.

## Estado del plan

- [x] Etapa 0: base y red de seguridad
- [ ] Etapa 1: sistema visual (casi completa)
- [ ] Etapa 2: UX del taller
- [ ] Etapa 3: back
- [ ] Etapa 4: rendimiento y renderizado
- [ ] Etapa 5: calidad, monitoreo y operación

### Hecho en la rama

- Etapa 0: CI (formato, lint, tipos, pruebas, build); Next 15.5.29 y parches de node-forge y fast-xml-parser; Prettier en todo el repo; `no-explicit-any` como advertencia; `supabase/README.md` con el estado del historial de migraciones; scripts `db:types` y `db:export-migrations`; migración del índice duplicado (pendiente de aplicar); README real; línea base en `docs/plan-mejora/linea-base.md`.
- Etapa 1: Tailwind 4 con tokens semánticos en `src/app/globals.css` (sin `slate-*` ni colores sueltos de estado); botón con jerarquía y `loading`; insignia `info`; texto mínimo de 13 px; diálogo de confirmación (`src/components/ui/confirm-dialog.tsx`: `confirmThen`, `confirmSubmit`) y avisos (`src/components/ui/toaster.tsx`) montados en el layout del panel; tildes en palabras con mayúscula y frases visibles; "Cobros de reparaciones"; Cuotas fuera del menú. Hoja visual: `npx tsx scripts/qa/ui-reference.tsx > tmp/qa/ui-reference.html` después de `npm run build`.

- Etapa 2 (empezada): la mesa de trabajo abre en tabla compacta en escritorio (`initialPresentation`), con días en el local, una acción de WhatsApp según el próximo paso y el resto en "Más acciones" (`ActionMenu iconOnly`); "Cobrar" y "Registrar entrega" son primarios solo cuando corresponden. Vista de control: `npx tsx scripts/qa/workshop-table.tsx > tmp/qa/workshop-table.html`.

### Pendiente

- Dueño: ejecutar `db:export-migrations` y `db:types` con sus credenciales; cuenta de Sentry; protección de contraseñas filtradas en Supabase Auth.
- Etapa 1: 12 confirmaciones nativas en guardas de navegación con borradores (`use-persistent-form-draft`, `use-payment-draft`, `repairs-list`, `repair-order-collection-actions`, `order-coordination-panel`, `workshop-updates`, `repair-access-orders-section`); tildes en palabras en minúscula dentro de frases (hacerlo por pantalla, nunca en claves, valores internos, SQL, mensajes de PostgreSQL ni PDF); Speed Insights (choca con el peer opcional de Vite de Vitest 3).
- Etapa 2, en este orden: ficha con pestañas y panel lateral; rutas `/taller/...` con redirecciones; búsqueda global (Ctrl+K); inicio "Hoy en el taller" (sin la tarjeta de Cuotas); menú con grupos plegables; listado primero en Ventas, Gastos, Cobros, Terciarizaciones y Facturación; guardar sin recargar con avisos; repuestos en un solo lugar; ingreso asistido.
- Etapas 3, 4 y 5 completas.
- Zod 4 (aviso de seguridad) en la Etapa 3.
