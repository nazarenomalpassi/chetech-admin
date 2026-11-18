# Railway

El sistema de gestión corre entero en el proyecto **chetech** del workspace **Chetech** de Railway (región `us-east4`): la aplicación, la base, el inicio de sesión y los archivos. El proyecto de Supabase `chetechweb` queda sin tocar como respaldo de la copia del 18/11/2026 y, hasta que se mude, sigue atendiendo a la tienda.

## Direcciones

- Sistema: `https://gestion.chetechstore.com`. El dominio raíz `chetechstore.com` queda reservado para la tienda.
- DNS en Cloudflare: `gestion` es un CNAME al dominio que da Railway, **sin proxy** (nube gris), más el TXT `_railway-verify.gestion` que Railway pide para emitir el certificado. Con el proxy de Cloudflare activado el certificado no se renueva.
- `chetech-admin.vercel.app` redirige al dominio nuevo (`vercel.json`): los QR ya impresos apuntan ahí.

## Servicios

| Servicio | Qué hace |
| --- | --- |
| Sistema de gestion | La aplicación Next.js de este repo (`railway.json`). |
| Postgres | Postgres 17 con las extensiones de Supabase, en un volumen. |
| Gotrue Auth | Inicio de sesión (mismos usuarios y contraseñas que en Supabase). |
| Postgrest | La API REST que usa la aplicación. |
| Supabase Storage | Archivos de las órdenes y de la tienda, guardados en el bucket `S3` del proyecto. |
| Envoy | Puerta de entrada: es la dirección de `NEXT_PUBLIC_SUPABASE_URL`. |
| Supabase Studio y Postgres Meta | Panel para mirar tablas y correr SQL. |
| Migracion Supabase | Tarea de una sola vez que copió la base y los archivos desde Supabase (`scripts/railway/migrator`). |

La red privada de Railway entrega direcciones IPv6, así que cada servicio tiene que escuchar en IPv6. PostgREST escucha solo en IPv4 por defecto: necesita `PGRST_SERVER_HOST=*6`; sin eso Envoy responde 503 a todo lo que va a `/rest/v1`.

Realtime, Supavisor e Imgproxy no se instalaron: el taller vuelve a consultar cada 25 segundos cuando no hay tiempo real, y la aplicación no usa los otros dos.

## Claves

Todos los secretos de la base salen de un único `ROOT_SECRET`, guardado como variable en Railway. La aplicación recibe `SUPABASE_ROOT_SECRET` como referencia a esa variable y `scripts/railway/with-supabase-keys.mjs` calcula la clave anónima al construir y al arrancar, con la misma derivación que los servicios de la base. Ninguna clave se copia a mano ni queda en el repositorio.

## Aplicación

- Origen: este repositorio. Se construye y arranca a través de `with-supabase-keys.mjs`, y Railway controla `/api/health`, que responde sin consultar la base.
- Una réplica y **Serverless** activado: si nadie usa el sistema durante un rato, se duerme y deja de consumir; el primer pedido después tarda unos segundos más.
- Variables: `NEXT_PUBLIC_SUPABASE_URL` (dirección pública de Envoy), `SUPABASE_ROOT_SECRET` (referencia), `NEXT_PUBLIC_APP_URL=https://gestion.chetechstore.com` (QR y enlaces de los comprobantes) y `NEXT_TELEMETRY_DISABLED=1`.
- Opcionales, como en Vercel: las de ARCA y las de WhatsApp (ver `.env.example`). Fuera del entorno `production` de Railway, WhatsApp nunca envía mensajes.

## Migraciones de esquema

La base de Railway no tiene el historial `supabase_migrations` (la copia trajo solo los esquemas `public`, `private` y `document_access`). Las migraciones nuevas se escriben igual que antes (`supabase/migrations/`) y se aplican desde el editor SQL de Studio, en orden. El historial completo sigue en Supabase para `db:export-migrations`.

## La copia desde Supabase

`scripts/railway/migrator/migrate.sh` borra la base de Railway, copia esquema, datos, usuarios, buckets, reglas de archivos y archivos, y al final compara la cantidad de filas de cada tabla entre las dos bases. Con `MIGRATE_MODE=check` solo se conecta y cuenta. **Después del corte la variable queda en `check`**: con `run`, un nuevo despliegue de la tarea borraría los datos cargados en Railway.

## Gasto

- El plan Pro incluye un monto de uso por mes. Cada servicio tiene un tope de memoria y CPU acorde a lo que usa.
- Límite duro: **Workspace → Usage → Set Usage Limits**, con una alerta por correo y un límite de gasto. Al llegar al límite Railway apaga los servicios, así que conviene dejar margen.
- Si hace falta recortar, Studio y Postgres Meta se pueden quitar: no los usa la aplicación.

## Respaldo

- Railway guarda copias programadas del volumen de Postgres (Backups del servicio). Conviene una diaria y una semanal.
- El respaldo propio del sistema (`/api/backup` y `docs/operations/backup-restore.md`) sigue igual.
