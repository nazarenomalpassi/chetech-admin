# CheTech Admin

### Gestión comercial para un local de tecnología

Aplicación web para organizar productos, ventas, gastos, reparaciones y comprobantes de un comercio de tecnología.

**Next.js 15 · React 19 · TypeScript · Tailwind CSS · Supabase / PostgreSQL**

[Ver tienda pública de CheTech](https://chetech-tienda.vercel.app/) · [Mi GitHub](https://github.com/nazarenomalpassi) · [LinkedIn](https://www.linkedin.com/in/nazareno-malpassi-8813bb1bb/)

## Qué incluye este repositorio

- Inicio de sesión y protección de rutas.
- Panel administrativo adaptable a distintos dispositivos.
- Catálogo de productos con búsqueda, filtros y formularios.
- Módulos de ventas, gastos y reparaciones.
- Gestión de comprobantes.
- Esquema de base de datos y migraciones SQL.
- Script de importación inicial desde Excel.

Este repositorio contiene una versión pública del sistema administrativo. La tienda online es una aplicación separada y la versión utilizada por el comercio puede incluir desarrollos posteriores.

## Tecnologías

| Área | Herramientas |
| --- | --- |
| Aplicación | Next.js con App Router, React y TypeScript |
| Interfaz | Tailwind CSS, Lucide y Recharts |
| Datos y autenticación | Supabase y PostgreSQL |
| Validación | Zod y React Hook Form |
| Importación | XLSX y TSX |

## Desarrollo local

Necesitás Node.js y npm, además de un proyecto propio de Supabase.

1. Cloná el repositorio e instalá las dependencias:

   ```bash
   git clone https://github.com/nazarenomalpassi/chetech-admin.git
   cd chetech-admin
   npm install
   ```

2. Copiá `.env.example` a `.env.local` y completá la configuración de tu entorno.
3. Prepará una base de datos de desarrollo con `supabase/schema.sql` y revisá las migraciones de `supabase/migrations/`.
4. Iniciá la aplicación:

   ```bash
   npm run dev
   ```

La aplicación se abre en [localhost:3000](http://localhost:3000). No incluye acceso a las cuentas ni a los datos del comercio.

## Estructura

```text
src/app/          Rutas y páginas de la aplicación
src/components/   Componentes de interfaz y navegación
src/features/     Lógica y vistas por módulo
src/lib/          Autenticación, permisos y utilidades
supabase/         Esquema y migraciones SQL
scripts/          Herramientas de importación
```

## Comandos disponibles

```bash
npm run dev         # Desarrollo local
npm run typecheck   # Comprobación de TypeScript
npm run build       # Compilación de producción
npm run start       # Ejecutar una compilación
```

## Sobre el proyecto

Desarrollado por **Nazareno Malpassi**, estudiante avanzado de la Tecnicatura Universitaria en Programación de UTN San Nicolás. Integro herramientas de IA como apoyo al desarrollo.

El objetivo del proyecto es aplicar programación y bases de datos a necesidades reales de gestión comercial.
