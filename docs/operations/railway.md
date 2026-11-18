# Railway

Guía para correr el sistema en el workspace **Chetech** de Railway. La base, el inicio de sesión y los archivos siguen en Supabase hasta que el dueño decida otra cosa (ver "Decisión pendiente").

## Servicio de la aplicación

- Origen: este repositorio, rama `main`. La configuración está en `railway.json`: se construye con `npm run build`, arranca con `npm run start` y Railway controla `/api/health`, que responde sin consultar la base.
- Una sola réplica y **Serverless** activado (`sleepApplication`): si nadie usa el sistema durante un rato, el servicio se duerme y deja de consumir. El primer pedido después lo despierta y tarda unos segundos más.
- Variables obligatorias:
  - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (públicas, las mismas que usa hoy Vercel).
  - `NEXT_PUBLIC_APP_URL`: la dirección pública definitiva (por ejemplo `https://admin.chetech.ar`). Se usa en los QR y enlaces de los comprobantes; sin ella quedan apuntando a `chetech-admin.vercel.app`.
  - `NODE_OPTIONS=--max-old-space-size=384` para que Node no reserve más memoria de la necesaria.
- Opcionales: `SUPABASE_SERVICE_ROLE_KEY`, las de ARCA y las de WhatsApp (ver `.env.example`). Fuera del entorno `production` de Railway, WhatsApp nunca envía mensajes.

## Gasto

- El plan Pro incluye un monto de uso por mes; el servicio de la aplicación con Serverless entra holgado.
- Límite duro: en Railway, **Workspace → Usage → Set Usage Limits**, poner una alerta por correo y un límite duro de gasto de cómputo. Al llegar al límite Railway apaga los servicios, así que conviene dejar margen sobre lo incluido.

## Corte desde Vercel

1. Desplegar en Railway y probar con el dominio `*.up.railway.app`.
2. Conectar el dominio propio y cargar `NEXT_PUBLIC_APP_URL`.
3. Mantener `chetech-admin.vercel.app` con una redirección al dominio nuevo: los QR ya impresos en las etiquetas apuntan ahí y tienen que seguir funcionando.

## Decisión pendiente: la base de datos

Railway no tiene región en Sudamérica; Supabase está en San Pablo. Las opciones están descritas en el informe del 18/11/2026 y se eligen antes de mover datos.
