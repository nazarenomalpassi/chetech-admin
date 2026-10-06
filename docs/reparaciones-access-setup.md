# Reparaciones Access: entorno paralelo

Esta rama trabaja en paralelo a produccion y no debe usar la misma base de datos.

## Rama y carpeta de trabajo

- Rama: `feature/reparaciones-access`
- Carpeta limpia: `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai-reparaciones-access`

## Variables que necesita esta rama

Copiar `.env.repairs-access.example` a `.env.local` y completar:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Importante

- No reutilizar las variables de produccion.
- Configurar esas mismas variables en Vercel para `Preview`.
- No hacer deploy `--prod`.
- No mergear a `main` hasta validar el modulo nuevo.

## Proyecto Supabase recomendado

Crear un proyecto nuevo solo para esta rama, por ejemplo:

- Nombre: `chetech-reparaciones-dev`
- Region: la misma que uses en produccion para minimizar diferencias

Despues de crear el proyecto:

1. Ir a `Project Settings -> API`
2. Copiar `Project URL`
3. Copiar `anon public key`
4. Copiar `service_role key`
5. Pegarlas en `.env.local`
6. Cargar esas mismas variables en Vercel Preview

## Esquema inicial

La migracion inicial del sistema paralelo de Access queda en:

- `supabase/migrations/20260529_repairs_access_initial.sql`

Las tablas nuevas son:

- `repair_access_customers`
- `repair_access_devices`
- `repair_access_orders`
- `repair_access_status_history`
- `repair_access_payments`

Se crean con prefijo propio para no mezclar el modulo nuevo con `repairs`, que ya existe en el sistema actual.
