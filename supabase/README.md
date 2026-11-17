# Base de datos

El esquema vive en el proyecto de Supabase `chetechweb` (`sa-east-1`), compartido con la tienda online. Este repo es el dueño del esquema.

## Estado del historial de migraciones (17/11/2026)

El historial registrado en producción (`supabase_migrations.schema_migrations`) y la carpeta `migrations/` no coinciden:

| | Cantidad |
| --- | ---: |
| Migraciones registradas en producción | 89 |
| Archivos en `migrations/` hasta el 10/11/2026 | 82 |
| Registradas en producción sin archivo en el repo | 31 |
| Archivos del repo con otro nombre o consolidados en producción | 24 |

Las 31 que faltan son, en su mayoría, de la tienda y del portal de clientes (`*storefront*`, `*consumer*`, `customer_repair_portal`, `repair_budget_timeline_*`), más las versiones consolidadas del 04/06/2026 (`principal_safe_base`, `repairs_access_*`). Los 24 archivos locales sin registro corresponden a cambios que se aplicaron en producción dentro de esas consolidaciones.

`schema.sql` describe la versión inicial y no alcanza para reconstruir la base.

## Cómo reconciliarlo

Producción es la fuente de verdad. El SQL de cada migración aplicada está guardado en `supabase_migrations.schema_migrations.statements`.

1. Exportar el historial completo con una conexión directa (no se versiona ninguna credencial):

   ```bash
   SUPABASE_DB_URL="postgresql://..." npm run db:export-migrations
   ```

   Escribe `supabase/migrations-remote/<version>_<nombre>.sql`, una por migración registrada.

2. Revisar los archivos antes de commitear: el repo es público y algunas migraciones de importación pueden contener datos de clientes. Las que tengan datos se reemplazan por un archivo con solo el encabezado y una nota.
3. Reemplazar `migrations/` por lo exportado y mover los archivos actuales a `migrations-legacy/`.

## Tipos de TypeScript

```bash
SUPABASE_ACCESS_TOKEN="..." npm run db:types
```

Genera `src/lib/db/database.types.ts` con las tablas y funciones del esquema `public`.

## Migraciones nuevas

- Nombre: `migrations/<AAAAMMDDhhmmss>_<nombre>.sql`, idempotentes y aditivas cuando se pueda.
- Las que cambian datos (por ejemplo, la unificación de cobros) se aplican solo después de un respaldo completo y verificado (`docs/operations/backup-restore.md`).
- Si se aplican con la herramienta `apply_migration`, Supabase registra la hora de aplicación como versión: renombrá el archivo con esa versión para que el repo y producción sigan alineados.
- Aplicadas el 17/11/2026 con `apply_migration` (sin cambios de datos):
  - `20261117220926_workshop_today.sql`: función de solo lectura `get_workshop_today()` del inicio "Hoy en el taller". Reversión: `drop function public.get_workshop_today(); drop function private.get_workshop_today();`.
  - `20261117220945_drop_duplicate_workshop_order_index.sql`: quita un índice idéntico a `repair_access_orders_created_at_id_idx`. Reversión: recrear `workshop_orders_creation_idx` sobre `(created_at desc, id desc)`.
- Pendientes de aplicar: ninguna.

## Ajustes que no son SQL

- Activar la protección de contraseñas filtradas en Authentication → Policies.
- Migrar a claves de firma JWT asimétricas (Etapa 3 del plan). Afecta también a la tienda.
