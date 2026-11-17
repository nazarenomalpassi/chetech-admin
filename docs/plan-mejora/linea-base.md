# Línea base del plan de mejora

Medición del 17/11/2026 sobre `main` (`49a18b7`), antes de empezar el plan. Sirve para comparar al cerrar la Etapa 4.

## Verificación

| Chequeo | Resultado |
| --- | --- |
| Lint | Sin errores |
| TypeScript | Sin errores |
| Pruebas | 1.703 aprobadas, 80 omitidas (requieren base de datos) |
| Build | Correcto con Next.js 15.5.25 |

## JavaScript inicial por ruta (First Load JS)

| Ruta | Tamaño |
| --- | ---: |
| `/reparaciones-access` y `/reparaciones-access/orden/[id]` | 257 kB |
| `/reportes` | 216 kB |
| `/pedidos` | 150 kB |
| `/placas-tv` | 147 kB |
| `/productos` | 146 kB |
| `/reparaciones` | 144 kB |
| `/facturacion/[id]` | 139 kB |
| `/visitas` | 137 kB |
| `/configuracion` | 136 kB |
| `/ventas` | 127 kB |
| `/sueldos` | 126 kB |
| `/terciarizaciones` | 123 kB |
| `/gastos`, `/facturacion` | 122 kB |
| `/caja` | 117 kB |
| `/cuotas` | 116 kB |
| `/cambio-balance` | 115 kB |
| `/login` | 112 kB |
| `/dashboard` | 106 kB |
| Compartido por todas las rutas | 102 kB |

Objetivo de la Etapa 4: ninguna ruta por encima de 150 kB.

## Recorrido de uso

En la mesa de trabajo, a 1366 × 768, entran tres órdenes por pantalla y cada tarjeta tiene doce controles. La ficha completa ocupa cinco pantallas de alto.

Los tiempos de carga reales se miden con Speed Insights, que se suma en la Etapa 5.
