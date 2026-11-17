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

- [ ] Etapa 0: base y red de seguridad
- [ ] Etapa 1: sistema visual
- [ ] Etapa 2: UX del taller
- [ ] Etapa 3: back
- [ ] Etapa 4: rendimiento y renderizado
- [ ] Etapa 5: calidad, monitoreo y operación

Hecho en la rama: CI de GitHub Actions y limpieza del archivo vacío `=` de la raíz.
