# CheTech Admin

Sistema de gestión de CheTech, taller técnico y local de tecnología. Ordena el día a día del mostrador y del banco de trabajo: ingreso de equipos, presupuestos, reparaciones, garantías, cobros y entregas, junto con ventas, stock, caja, gastos, sueldos y comprobantes.

**Next.js 15 · React 19 · TypeScript · Tailwind CSS · Supabase / PostgreSQL**

[Tienda online de CheTech](https://chetech-tienda.vercel.app/) · [GitHub](https://github.com/nazarenomalpassi) · [LinkedIn](https://www.linkedin.com/in/nazareno-malpassi-8813bb1bb/)

## Secciones

| Grupo | Secciones |
| --- | --- |
| Taller | Reparaciones (mesa de trabajo, ficha de la orden, ingreso, garantías, repuestos, métricas y clientes), Visitas, Terciarizaciones y Pedidos |
| Comercial | Productos, Ventas y Placas de televisores |
| Finanzas | Caja, Transferencias entre cuentas, Cobros de reparaciones, Gastos, Sueldo, Facturación y Reportes |
| Administración | Configuración |

Hay dos roles: administrador y técnico. Los permisos se validan en el servidor y con seguridad por fila en PostgreSQL. Las operaciones con dinero, stock y numeración de órdenes se resuelven en funciones SQL atómicas.

Cada orden tiene una etiqueta con un QR privado que solo abre la ficha con una sesión autorizada del local.

## Desarrollo local

Necesitás Node.js 20 o superior y un proyecto propio de Supabase.

```bash
git clone https://github.com/nazarenomalpassi/chetech-admin.git
cd chetech-admin
npm install
cp .env.example .env.local   # completá la URL y la clave pública de tu proyecto
npm run dev
```

La aplicación se abre en [localhost:3000](http://localhost:3000). El repositorio no incluye acceso a las cuentas ni a los datos del comercio. Para la base de datos, mirá [`supabase/README.md`](supabase/README.md).

## Comandos

```bash
npm run dev            # desarrollo local
npm run lint           # ESLint
npm run format         # Prettier
npm run typecheck      # TypeScript
npm test               # Vitest
npm run build          # compilación de producción
npm run db:types       # tipos de TypeScript desde Supabase
```

GitHub Actions corre formato, lint, tipos, pruebas y build en cada push.

## Estructura

```text
src/app/          Rutas, páginas y endpoints
src/components/   Componentes compartidos de interfaz y navegación
src/features/     Lógica, consultas, acciones y vistas por módulo
src/lib/          Autenticación, permisos, Supabase y utilidades
supabase/         Migraciones SQL y documentación de la base
scripts/          Importaciones, respaldo y verificaciones
docs/             Operación, auditorías y notas de cada entrega
```

## Sobre el proyecto

Desarrollado por **Nazareno Malpassi**, estudiante avanzado de la Tecnicatura Universitaria en Programación de UTN San Nicolás, con herramientas de IA como apoyo al desarrollo.
