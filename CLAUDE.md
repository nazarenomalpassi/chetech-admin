# CheTech Admin: instrucciones para agentes

Sistema de gestión de un taller técnico y local de tecnología: reparaciones, ventas, caja, gastos, sueldos y comprobantes. Lo usan todos los días el dueño (administrador) y los técnicos, en la PC del mostrador y en celulares.

## Stack y entornos

- Next.js 15 (App Router), React 19, TypeScript estricto, Tailwind CSS 3 y Supabase (PostgreSQL 17, Auth, Storage).
- Producción: https://gestion.chetechstore.com, en Railway (workspace Chetech, proyecto `chetech`, región `us-east4`). **Cada commit en `main` se publica solo.** Guía: `docs/operations/railway.md`.
- Base de datos, inicio de sesión y archivos: Supabase autoalojado en el mismo proyecto de Railway (Postgres 17, GoTrue, PostgREST, Storage), copiado el 18/11/2026. Las claves salen de un único `ROOT_SECRET` (`scripts/railway/with-supabase-keys.mjs`). Las migraciones se aplican desde Studio.
- Vercel ya no se usa para el sistema (el proyecto `chetech-admin` quedó pausado). El proyecto de Supabase `chetechweb` (`sa-east-1`) queda como respaldo y, hasta que se mude, lo sigue usando la tienda online (otro repo y otro proyecto de Vercel, `chetech-tienda`). Antes de cambiar tablas `storefront_*`, `customer_*` o `consumer_*`, o funciones `get_storefront_*`, `submit_consumer_request` y las del portal de clientes, revisá el impacto en la tienda.

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

- El trabajo se hace en la rama `mejora/plan-integral` y pasa a producción por PR a `main`. El primer pase se hizo el 17/11/2026 (PR #23), con autorización del dueño.
- Las migraciones que cambian datos, incluida la unificación de cobros, se aplican solo después de un respaldo completo y verificado (`docs/operations/backup-restore.md`). Las aditivas sin datos se pueden aplicar con autorización del dueño.
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

- Etapa 0: CI (formato, lint, tipos, pruebas, build); Next 15.5.29 y parches de node-forge y fast-xml-parser; Prettier en todo el repo; `no-explicit-any` como advertencia; `supabase/README.md` con el estado del historial de migraciones; scripts `db:types` y `db:export-migrations`; migración del índice duplicado (aplicada el 17/11/2026); README real; línea base en `docs/plan-mejora/linea-base.md`.
- Etapa 1: Tailwind 4 con tokens semánticos en `src/app/globals.css` (sin `slate-*` ni colores sueltos de estado); botón con jerarquía y `loading`; insignia `info`; texto mínimo de 13 px; diálogo de confirmación (`src/components/ui/confirm-dialog.tsx`: `confirmThen`, `confirmSubmit`) y avisos (`src/components/ui/toaster.tsx`) montados en el layout del panel; tildes en palabras con mayúscula y frases visibles; "Cobros de reparaciones"; Cuotas fuera del menú. Hoja visual: `npx tsx scripts/qa/ui-reference.tsx > tmp/qa/ui-reference.html` después de `npm run build`.

- Etapa 2 (empezada): la mesa de trabajo abre en tarjetas (decisión del dueño del 18/11/2026: prefiere tarjetas a la tabla), en grilla de dos o tres columnas en escritorio, con cabecera compacta (REP en monoespaciada, estado, días en el local, cliente y equipo), próximo paso en una línea, datos en un bloque y un solo pie de acciones; la tabla compacta queda detrás de "Ver tabla" (`initialPresentation`). "Cobrar" y "Registrar entrega" son primarios solo cuando corresponden. Las tarjetas se acomodan a su propio ancho con consultas de contenedor (`@container`), no al de la pantalla: el bloque de comprobantes pone el destinatario arriba de los botones y el pie deja WhatsApp y Llamar con ícono en columnas angostas (sin teléfono, un solo aviso). Revisadas las 596 órdenes con tarjetas de 460, 340 y 300 px el 18/11/2026. Vista de control: `npx tsx scripts/qa/workshop-table.tsx > tmp/qa/workshop-table.html` (`QA_CARDS=1` para las tarjetas). Menú lateral con grupos plegables que recuerdan su estado (`src/components/layout/sidebar-groups.tsx`, clave `chetech:menu:grupos-abiertos`); la sección activa se marca también en subrutas (`isNavItemActive`). Inicio "Hoy en el taller" (`workshop-today-section.tsx`): etapas con enlace a la mesa filtrada, avisos de antigüedad, repuestos y visitas en una línea y, para el administrador, las finanzas inmediatamente debajo con el gráfico de ingresos y egresos por día (`cash-flow-chart.tsx`, lee `get_dashboard_daily_cash`, migración `20261118134155_dashboard_daily_cash.sql`, aplicada); la lista de equipos que esperan retiro se quitó a pedido del dueño el 18/11/2026; la bandeja del taller va al final; sin Cuotas. Lee `get_workshop_today()` (migración `20261117220926_workshop_today.sql`, aplicada); si no responde, muestra un aviso. Vista de control: `npx tsx scripts/qa/home.tsx > tmp/qa/home.html`.
- Pasada de interfaz (18/11/2026, aparte del plan): `PageHeader` (`src/components/ui/page-header.tsx`) en todas las secciones; listado primero con formulario plegable (`composerOpen`) en Ventas, Gastos, Cobros, Terciarizaciones y Facturación; barra superior con sección actual y Nueva orden; `UserBadge` en el menú; celular con barra inferior (`mobile-quickbar`) y menú como panel; diálogos como hoja inferior en celular; pestañas del taller con `.section-tab`; tildes y voseo en textos visibles (script de referencia: `/tmp/tildes3.py` no se versiona; la regla es tocar solo texto JSX y atributos `label`, `placeholder`, `title`, `aria-label`, `description`). Vista de control del shell: `npx tsx scripts/qa/shell.tsx > tmp/qa/shell.html` (`QA_MOBILE=1` para el celular).
- Placas de televisores por cajas (pedido del dueño del 18/11/2026, aparte del plan): al entrar se ven las cajas numeradas (Caja 1, 2, 3…, número automático y sin límite de placas), la tarjeta "Sin caja" y "Nueva caja"; arriba, el buscador (modelo, marca o "caja N") con filtros de marca, tipo y estado, y cada resultado dice en qué caja está. `?caja=N` abre una caja (Editar caja, Eliminar caja solo si está vacía, Agregar placa con la caja preseleccionada); `?caja=sin`, las placas sin caja. Ventas por Mercado Libre, reclamos y liberaciones siguen igual, debajo de las cajas. Una placa vendida deja de contar en su caja ("Estaba en caja N"). Código en `src/features/tv-boards` (`box-actions.ts`, `box-grid.tsx`, `box-form-dialog.tsx`); migración `20261118143122_tv_board_boxes.sql`, aplicada. Si la tabla no existe, la sección se ve como antes (`boxesReady`). Vista de control: `npx tsx scripts/qa/tv-boxes.tsx > tmp/qa/tv-boxes.html` (`QA_MODE=search` o `box`, `QA_MOBILE=1`).
- Mudanza a Railway (pedido del dueño del 18/11/2026, aparte del plan): aplicación, base, inicio de sesión y archivos en el workspace Chetech, con Serverless en la aplicación, Studio y Postgres Meta (estos dos fuera de Envoy para que se duerman), topes por servicio y límite del workspace (aviso a USD 20, corte a USD 30); copias diarias y semanales del volumen; sin Realtime (el taller consulta cada 25 s), Supavisor ni Imgproxy. Copia con `scripts/railway/migrator` (verifica filas tabla por tabla; queda en `MIGRATE_MODE=check`). Dominio `gestion.chetechstore.com` (Cloudflare, CNAME sin proxy); `chetechstore.com` queda para la tienda.
- Etapa 4 (adelantada): Recharts, el cliente de Supabase del navegador y el diálogo de confirmación se cargan diferidos. JavaScript inicial: Reparaciones 198 kB (antes 279), Reportes 116 kB (antes 216).

### Pendiente

- Dueño: ejecutar `db:export-migrations` y `db:types` con sus credenciales (contra Supabase, que guarda el historial); cuenta de Sentry.
- Railway: mudar la tienda (`chetech-tienda`) al mismo proyecto y a `chetechstore.com`; hasta entonces la tienda lee y escribe en Supabase, no en la base nueva. Después, dar de baja los proyectos de Vercel y pausar Supabase.
- Etapa 1: 7 confirmaciones nativas en guardas sincrónicas de borradores (`use-persistent-form-draft` y `use-payment-draft`: enlace y botón Atrás; `repair-order-collection-actions`: `closeForm` devuelve un booleano; `repairs-list`: `mayReplaceEditor`). Pasarlas al diálogo exige que quien las llama espere la respuesta; el botón Atrás no se puede frenar de forma asincrónica sin perder el formulario; tildes pendientes solo en mensajes de servidor (`form-state.ts`, acciones) y PDF.
- Etapa 2, en este orden: ficha con pestañas y panel lateral; rutas `/taller/...` con redirecciones; búsqueda global (Ctrl+K); guardar sin recargar con avisos; repuestos en un solo lugar; ingreso asistido. (Listado primero ya está hecho en la pasada de interfaz.)
- Etapas 3, 4 y 5 completas.
- Zod 4 (aviso de seguridad) en la Etapa 3.
