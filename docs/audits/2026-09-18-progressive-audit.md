# CheTech: auditoria progresiva (18/09/2026)

## Alcance y limites

Sistema administrativo en produccion con datos reales. Esta etapa inspecciono codigo, configuracion, tests, build, consultas read-only y asesores de Supabase. No se escribieron datos de produccion ni se ejecutaron migraciones. No se realizo una sesion E2E autenticada en dispositivos reales: los hallazgos visuales son de inspeccion de componentes y capturas existentes, no una aprobacion de todas las vistas en telefono. La rama `codex/migrar-reparaciones-principal` tenia mas de 200 entradas modificadas/no rastreadas antes de los cambios de esta etapa; no se revertiran ni se incluiran indiscriminadamente en un deploy.

## Reconocimiento

- Next.js 15.5.19 (App Router), React 19, TypeScript, Tailwind 3; Server Components/Actions, componentes cliente para formularios y Supabase SSR. Componentes UI locales; no shadcn/ui ni Radix.
- `src/app` contiene rutas y API; `src/features` separa modulos, consultas, acciones y componentes; `src/lib` concentra permisos, fechas, caja y clientes Supabase; `supabase/migrations` versiona el esquema. Vitest, ESLint y `tsc` ya estan configurados.
- Autenticacion y autorizacion en middleware, helpers de servidor y politicas/RPC de base; roles admin/tecnico. PWA con manifest y service worker; despliegue Vercel configurado en `gru1`.
- `README.md` no documenta el alcance actual del sistema. No se encontro `AGENTS.md`/`CLAUDE.md`. La estructura actual no justifica una migracion de framework, design system o data layer.

## Skills

Instaladas y verificadas localmente con la CLI oficial: `frontend-design` (Anthropic), `ui-ux-pro-max` (nextlevelbuilder), `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns` (Vercel), `next-best-practices` (Vercel openreview). Se reutilizan las ya instaladas `supabase-postgres-best-practices`, `webapp-testing`, `systematic-debugging` y `verification-before-completion` sin duplicarlas. Se descarta `shadcn` por no existir esa dependencia ni un caso de migracion suficientemente justificado. La Node local 20.12.2 no ejecuta la CLI reciente; se uso la Node 24.19.0 empaquetada con Codex para la instalacion.

## Linea de base

- Antes de editar codigo: 53 archivos de pruebas, 158 tests correctos; `npm run typecheck`, `npm run lint` y `npm run build` correctos. JS compartido del build: 102 kB; first load `/reparaciones-access`: 149 kB, `/placas-tv`: 143 kB, `/productos`: 141 kB.
- Lecturas read-only aisladas: 150 ordenes de reparacion: 1.372 ms / 201.562 bytes; 361 clientes: 1.234 ms / 96.916 bytes; 565 movimientos de caja: 1.206 ms / 50.617 bytes; RPC agregada: 1.189 ms / 466 bytes. La latencia incluye red y no equivale al tiempo de navegacion percibido.
- Script comparativo de consultas con cache/red caliente: ventas legado 346 ms, 3 requests y 15,3 kB frente a patron relacional 79 ms, 1 y 13,4 kB; reparaciones 231 ms, 2 y 17,5 kB frente a 142 ms, 1 y 16,5 kB; caja 243 ms, 5 y 131,7 kB frente a snapshot 96 ms, 3 y 22,9 kB; reportes 526 ms, 23 y 40,9 kB frente a snapshot 103 ms, 2 y 2,1 kB. **Son comparaciones de patrones existentes, no mejoras obtenidas por esta auditoria ni tiempos de rutas reales.** Hay que medir navegacion autenticada con DevTools en produccion antes de atribuir demoras.
- Una llamada a `products_category_counts_optimized` con **service role** devolvio error de permiso: la funcion exige contexto de usuario autenticado mediante `private.can_access_operations()`. La medicion no simula ese contexto; no se clasifica como bug de Productos.

## Hallazgos priorizados

| Severidad | Archivo / problema y causa | Impacto | Propuesta | Riesgo / esfuerzo |
| --- | --- | --- | --- | --- |
| ALTO | `src/features/repairs-access/components/repair-access-new-order-wizard.tsx`: fecha inicial usa UTC (`toISOString().slice(0,10)`) | Despues de las 21:00 en Argentina puede precargar el dia siguiente para una orden nueva | Usar `getLocalDateInputValue`, prueba a traves del formulario en el limite horario | Bajo / < 1 h |
| MEDIO | `src/features/outsourcings/queries.ts`: `sentToday` usa dia UTC | Resumen diario erroneo cerca de medianoche UTC | Misma utilidad de calendario operacional y prueba del agregado | Bajo / < 1 h |
| MEDIO | `src/features/outsourcings/queries.ts`: `.limit(200)` y KPIs calculados sobre la pagina | Totales, estados y talleres quedarian truncados con >200 registros; hoy hay solo 10 visibles | Separar resumen agregado del listado paginado cuando el crecimiento lo justifique, con regression y comparacion read-only | Medio / 1-2 dias, requiere revision de permisos/RPC |
| MEDIO | Operaciones de ventas/gastos conservan fallback legado no atomico si faltan ciertas RPC | Un entorno incompleto podria divergir stock/caja si se activa fallback | Verificar migraciones en todos los entornos y luego eliminar fallback con pruebas de idempotencia | Alto / 2-3 dias; no alterar sin inventario de entornos |
| ALTO | `package-lock.json`: `npm audit` detecto vulnerabilidades directas en `next` (critica, resuelta en el despliegue posterior), `vitest` (critica en herramientas de desarrollo) y `xlsx` (alta, sin fix automatico) | Posible exposicion de rutas/Server Actions y riesgo en importacion de planillas, segun uso real | Investigar y actualizar por separado Vitest y aislar o reemplazar `xlsx` con pruebas de importacion | Medio-alto / 1-3 dias; no ejecutar `npm audit fix --force` a ciegas |
| BAJO | `README.md`: describe un estado inicial, no modulos/roles actuales | Incorporacion y despliegue mas propensos a errores | Actualizar guia de arquitectura/operacion sin incluir secretos | Bajo / horas |

Los asesores de Supabase reportan 4 funciones `SECURITY DEFINER` invocables por `anon`, 8 por `authenticated`, proteccion de contrasenas filtradas desactivada y 78 indices sin uso observado. Las primeras pueden pertenecer a flujos publicos de otra aplicacion; las tablas privadas con RLS sin politicas pueden ser intencionales. Se requiere inventario de definiciones, `GRANT`, propietarios y consumidores antes de revocar nada. No eliminar indices por la sola advertencia de uso. La separacion admin/tecnico tambien necesita pruebas E2E autenticadas de denegacion de API/SQL, no solo botones ocultos.

## Revision funcional/visual por areas

- Dashboard y Reportes: indicadores accionables y filtros por rango existentes; validar tiempos de navegacion y legibilidad 1024-1366 px y mobile con sesion real.
- Productos, Ventas, Gastos, Sueldos, Cuotas y Caja: patrones de tablas/formularios propios; revisar cada flujo de submit doble, rueda en monto, teclado/Enter, confirmacion de acciones destructivas, feedback pendiente y errores con pruebas de interaccion.
- Reparaciones, clientes, ordenes y tercerizaciones: vistas de taller dedicadas, borrador local y busqueda; priorizar fechas, lectura movil de numero de orden y paginacion/resumen de tercerizacion.
- El wizard de ingreso usa `label` envolvente con `id`/`name` para sus controles; no se confirmo un defecto de etiqueta en ese formulario. Falta aun probar navegacion por teclado y lectores reales.
- Placas TV, cambio de balance, configuracion y facturacion: preservar significado financiero y permisos; verificar estados vacios, badges y acciones en 375/768/1024/1366 px antes de retoques visuales.
- Sidebar/PWA: menu responsive y recursos offline existentes; probar instalacion, actualizacion de service worker y sesion en iOS fisico. No hay evidencia suficiente para afirmar cobertura total de accesibilidad, performance o seguridad de todas las pantallas.

## Plan por fases

1. **Ahora, riesgo bajo:** pruebas de limite horario y sustitucion de los dos defaults UTC; ejecutar tests, tipos, lint y build. Ninguna migracion ni cambio visual general.
2. **Rendimiento medido:** instrumentar navegacion autenticada (p50/p95 de transicion, requests, bytes, waterfall y errores) en desktop/movil; concentrarse en historiales con mayor costo y revisar el resumen limitado a 200, con regresiones y consulta paginada/aggregate compatible.
3. **Seguridad e integridad:** inventariar funciones `SECURITY DEFINER`, grants/RLS, rutas y fallback no atomico; probar admin/tecnico, stock y caja en entorno aislado antes de cualquier migration. Activar proteccion de contrasenas filtradas si la politica de Auth del proyecto lo permite.
4. **UX progresiva:** prueba guiada por tareas de mostrador y taller, teclado/labels, formularios, tablas y responsive; corregir solo puntos medidos, manteniendo identidad monocroma y densidad operativa.
5. **Cierre:** E2E autenticado sin escrituras en produccion (o fixture en staging), inspeccion movil real, regresion critica y despliegue controlado con monitoreo/rollback. No considerar esta primera etapa una certificacion de punta a punta.

## Cambios y verificacion de esta etapa

- Se corrigieron el default de fecha de ingreso de una orden nueva y la cuenta `sentToday` de tercerizaciones mediante la utilidad de calendario operacional ya existente. Se agregaron dos tests de regresion que fallaron con UTC y pasaron tras el cambio.
- Ninguna migration, ajuste de schema, cambio de roles, dato historico o deploy. Las skills se instalaron en el entorno local ignorado por Git.
- Despues del cambio: 55 archivos / 160 tests correctos; TypeScript y ESLint correctos; build de produccion correcto. No hay mejora de latencia atribuible a este cambio, solo exactitud de fecha en el limite UTC.

## Despliegue posterior de la correccion acotada

El 18/09/2026 se reconstruyo una copia temporal a partir de la fuente del despliegue productivo `dpl_2AqSte5TVDYyvxV9XnFSmbVNEXcg`. Los hashes de los 494 archivos fuente coincidian con el workspace, salvo los dos archivos de fecha y dos archivos generados por herramientas; para estos ultimos se restauro el contenido publicado. Se agregaron solo los dos tests y este informe. La comparacion entre el origen anterior y el candidato confirmo: dos archivos de codigo modificados, dos tests y el informe nuevos, y cache `tsconfig.tsbuildinfo` regenerada. No se incluyo ninguna migracion nueva.

En esa copia aislada pasaron 160 tests, `typecheck`, `lint` y `build`. Se creo el candidato `dpl_GvgJNimGpe5NF5LeUVKAcGF9b8zX` sin asignar inicialmente el dominio principal; `/login` y las redirecciones anonimas de `/dashboard` y `/api/backup` coincidieron con el despliegue anterior. Luego se promovio. La inspeccion posterior de `chetech-admin.vercel.app` devolvio ese ID en estado READY, `/login` 200 y `/dashboard` 307 hacia `/login`. No se ejecuto E2E autenticado ni prueba de escritura en produccion; estas limitaciones siguen vigentes.

### Fase de seguridad de dependencias

La linea Next.js 15.5 tiene parches de seguridad oficiales posteriores a la version 15.5.19 del primer despliegue (ver [comunicados oficiales](https://nextjs.org/blog)). Se probo aisladamente la actualizacion exacta a 15.5.25: `npm audit` dejo de clasificar a `next` como critico; permanece una advertencia moderada indirecta por PostCSS. Pasaron otra vez 160 tests, `typecheck`, `lint` y `build`; JS compartido 103 kB frente a 102 kB antes. Se genero el candidato `dpl_DJkrFSD9D9uYq5Bntf9hxbAddo6M`. La comparacion del origen con el despliegue de fechas mostro solo `package.json`, `package-lock.json` y cache TypeScript regenerada. Login y redirecciones anonimas coincidieron. Tras promover, el dominio publico devolvio ese ID READY, `/login` 200 y `/dashboard` 307 a `/login`.

Siguen 15 avisos de `npm audit` (1 bajo, 5 moderados, 8 altos y 1 critico). El critico restante corresponde a Vitest, que es dependencia de desarrollo, no al runtime Next.js. `xlsx` conserva dos avisos altos sin arreglo automatico; evaluar flujo real de importacion y reemplazo antes de tocar planillas del negocio. Esta fase no hizo pruebas de escritura autenticadas ni actualizo Vitest o `xlsx`.

La inspeccion de uso de `xlsx` encontro generacion de backup Excel en `src/app/api/backup/route.ts`; las lecturas de archivos estan en scripts locales de importacion (`scripts/import-chetech.ts`, `scripts/import-repair-access-customers.ts`, `scripts/import-repair-history.ts`), no en un endpoint publico de carga. Esto reduce la exposicion remota de esas fallas pero no elimina el riesgo al ejecutar manualmente importaciones de archivos no confiables. El recuento read-only de `public.repair_outsourcings` en produccion fue 11 total, 10 no cancelados; se posterga la RPC agregada hasta que el limite de 200 sea cercano o exista una medicion que justifique el cambio.
