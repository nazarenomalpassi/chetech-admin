# Railway

El sistema de gestión corre entero en el proyecto **chetech** del workspace **Chetech** de Railway (región `us-east4`): la aplicación, la base, el inicio de sesión y los archivos. El proyecto de Supabase `chetechweb` queda sin tocar como respaldo de la copia del 18/11/2026 y, hasta que se mude, sigue atendiendo a la tienda.

## Direcciones

- Sistema: `https://gestion.chetechstore.com`. El dominio raíz `chetechstore.com` queda reservado para la tienda.
- DNS en Cloudflare: `gestion` es un CNAME al dominio que da Railway, **sin proxy** (nube gris), más el TXT `_railway-verify.gestion` que Railway pide para emitir el certificado. Con el proxy de Cloudflare activado el certificado no se renueva.
- Vercel ya no se usa para el sistema: el proyecto `chetech-admin` quedó pausado y `chetech-admin.vercel.app` no responde.

## Servicios

| Servicio | Qué hace |
| --- | --- |
| Sistema de gestion | La aplicación Next.js de este repo (`railway.json`). |
| Postgres | Postgres 17 con las extensiones de Supabase, en un volumen. |
| Gotrue Auth | Inicio de sesión (mismos usuarios y contraseñas que en Supabase). |
| Postgrest | La API REST que usa la aplicación. |
| Supabase Storage | Archivos de las órdenes y de la tienda, guardados en el bucket `S3` del proyecto. |
| Envoy | Puerta de entrada: es la dirección de `NEXT_PUBLIC_SUPABASE_URL`. |
| Supabase Studio y Postgres Meta | Panel para mirar tablas y correr SQL. Apagados de uso diario (ver "Gasto"). |
| Migracion Supabase | Tarea de una sola vez que copió la base y los archivos desde Supabase (`scripts/railway/migrator`). |

La red privada de Railway entrega direcciones IPv6, así que cada servicio tiene que escuchar en IPv6. PostgREST escucha solo en IPv4 por defecto: necesita `PGRST_SERVER_HOST=*6`; sin eso Envoy responde 503 a todo lo que va a `/rest/v1`.

Realtime, Supavisor e Imgproxy no se instalaron: la mesa del taller consulta cada 25 segundos y no intenta conectarse al tiempo real salvo que `NEXT_PUBLIC_SUPABASE_REALTIME=on`; la aplicación no usa los otros dos.

## Claves

Todos los secretos de la base salen de un único `ROOT_SECRET`, guardado como variable en Railway. La aplicación recibe `SUPABASE_ROOT_SECRET` como referencia a esa variable y `scripts/railway/with-supabase-keys.mjs` calcula la clave anónima al construir y al arrancar, con la misma derivación que los servicios de la base. Ninguna clave se copia a mano ni queda en el repositorio.

## Aplicación

- Railway no agrega cabeceras de seguridad: las define `next.config.ts` (HSTS, marco solo propio, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) y oculta `X-Powered-By`.

- Origen: este repositorio. Se construye y arranca a través de `with-supabase-keys.mjs`, y Railway controla `/api/health`, que responde sin consultar la base.
- Una réplica y **Serverless** activado: si nadie usa el sistema durante un rato, se duerme y deja de consumir; el primer pedido después tarda unos segundos más.
- Variables: `NEXT_PUBLIC_SUPABASE_URL` (dirección pública de Envoy), `SUPABASE_ROOT_SECRET` (referencia), `NEXT_PUBLIC_APP_URL=https://gestion.chetechstore.com` (QR y enlaces de los comprobantes) y `NEXT_TELEMETRY_DISABLED=1`.
- Opcionales: las de ARCA y las de WhatsApp (ver `.env.example`). Fuera del entorno `production` de Railway, WhatsApp nunca envía mensajes.

## Migraciones de esquema

La base de Railway no tiene el historial `supabase_migrations` (la copia trajo solo los esquemas `public`, `private` y `document_access`). Las migraciones nuevas se escriben igual que antes (`supabase/migrations/`) y se aplican desde el editor SQL de Studio, en orden (primero hay que encenderlo, ver "Gasto"). El historial completo sigue en Supabase para `db:export-migrations`.

## La copia desde Supabase

`scripts/railway/migrator/migrate.sh` borra la base de Railway, copia esquema, datos, usuarios, buckets, reglas de archivos y archivos, y al final compara la cantidad de filas de cada tabla entre las dos bases. Con `MIGRATE_MODE=check` solo se conecta y cuenta. **Después del corte la variable queda en `check`**: con `run`, un nuevo despliegue de la tarea borraría los datos cargados en Railway.

## Gasto

- Límites del workspace (**Workspace → Usage → Set limits**): aviso por correo a los USD 20 y corte a los USD 30. Al llegar al corte Railway apaga los servicios. El plan Pro ya incluye USD 20 de uso por mes.
- Topes por servicio (memoria / CPU), con margen sobre lo que usan: aplicación 0,75 GB / 1; Postgres 1 GB / 1; PostgREST y Storage 0,5 GB / 0,5; GoTrue y Envoy 0,25 GB / 0,5; Studio 0,5 GB / 0,5; Postgres Meta 0,25 GB / 0,5. Railway cobra lo que se usa, no el tope: el tope solo evita que un error dispare el consumo.
- La aplicación, Studio y Postgres Meta tienen **Serverless**: se duermen cuando no reciben pedidos.
- Studio y Postgres Meta no están conectados a Envoy (`STUDIO_HOST` y `META_HOST` valen `not_present`), así Envoy no los despierta cada 5 segundos con sus controles y quedan dormidos. No se borran porque Studio guarda el `ROOT_SECRET` del que leen los demás servicios.
- Para usar Studio (por ejemplo, para aplicar una migración): en Envoy, volver a poner `STUDIO_HOST=${{"Supabase Studio".RAILWAY_PRIVATE_DOMAIN}}` y `META_HOST=${{"Postgres Meta".RAILWAY_PRIVATE_DOMAIN}}`, entrar por la dirección de Envoy con el usuario del panel y, al terminar, volver a `not_present`.
- La tarea de copia no consume: terminó y no queda corriendo.

## Respaldo

- Railway guarda copias del volumen de Postgres: una diaria (se conserva 6 días) y una semanal (27 días), más la manual del 18/11/2026 posterior a la mudanza.
- El respaldo propio del sistema (`/api/backup` y `docs/operations/backup-restore.md`) sigue igual.
