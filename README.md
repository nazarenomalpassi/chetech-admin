# Chetech Admin

Sistema administrativo para un local de tecnología construido con Next.js 15, App Router, TypeScript, Tailwind y Supabase.

## Incluye

- Layout admin responsive con sidebar
- Login con Supabase
- Middleware para proteger rutas
- Dashboard base conectado a Supabase
- Módulo Productos con filtros, buscador, formulario y acciones
- Esquemas Zod para ventas, gastos y reparaciones
- Esquema SQL para Supabase/PostgreSQL
- Script de importación inicial desde Excel

## Puesta en marcha

1. Copiá `.env.example` a `.env.local`
2. Completá las credenciales de Supabase
3. Instalá dependencias con `npm install`
4. Corré `npm run dev`
5. Aplicá `supabase/schema.sql` en tu proyecto de Supabase
