# Garantias e importacion historica de reparaciones

## Objetivo

Corregir el ciclo de garantias para que comience en el retiro efectivo e importar
las 261 ordenes de `Service Exporado.xlsx` sin reemplazar datos actuales, con
deduplicacion conservadora, auditoria por fila e idempotencia.

## Diagnostico actual

- Next.js 15, React 19, TypeScript y Supabase/PostgreSQL.
- El modulo operativo vigente usa `repair_access_customers`,
  `repair_access_devices`, `repair_access_orders` y
  `repair_access_status_history`.
- Produccion contiene 260 clientes, 120 equipos y 120 ordenes actuales.
- Las ordenes actuales comienzan el 2026-06-04. El Excel contiene 261 ordenes
  unicas entre 2024-11-27 y 2026-06-04.
- Existen `picked_up_at`, `warranty_days`, `warranty_start`,
  `warranty_until`, `warranty_conditions` y `warranty_active`, pero el frontend
  presenta la garantia como iniciada por facturacion y el backend no registra
  correctamente el retiro al cambiar a `retirado`.
- Ya existen lotes y filas de importacion para clientes; deben ampliarse para
  ordenes, claves estables, ambiguedades y datos crudos.

## Mapeo del Excel

| Excel | Destino |
| --- | --- |
| Numero de orden | `repair_access_orders.legacy_order_number` |
| Nombre Cliente | `repair_access_customers.full_name` |
| Telefono Celular | `phone` y `phone_normalized` |
| Telefono celular 2 / Telefono Fijo | `alternate_phone` o notas, sin pisar datos actuales |
| Email / DNI | cliente |
| Direccion, numero, piso, departamento, barrio, localidad, provincia | `repair_access_customers.address` |
| Equipo | `repair_access_devices.device_type` |
| Marca / Modelo | equipo |
| Numero de serie / Numero De Serie | `serial_number`, tomando el primer valor no vacio |
| Color | notas del equipo |
| Accesorios | `accessory_details` |
| Defecto | `repair_access_orders.issue_reported` |
| Fecha de ingreso | `intake_date` |
| Tecnico | `technician_name` |
| Costo reparacion | `budget_amount` y `final_amount` como dato historico |
| Detalle presupuesto | `budget_detail` |
| Trabajo realizado | `work_performed` |
| Observaciones | `notes` |
| ObservacionesUsoInterno | `internal_observations` |
| Fecha presupuesto | `budgeted_at` |
| Fecha reparado | `finished_at` |
| Retiro (Si-No) / Fecha de retiro | estado y `picked_up_at` |
| GarantiaTiempoDeFalla | `warranty_days` |
| Garantia hasta | vencimiento historico validado |
| GarantiaVencida | auditoria historica, nunca fuente del estado actual |
| DadoDeBaja / FechaDeBaja / CausaDeBaja | estado y auditoria/notas |
| Fila completa | `repair_access_import_rows.raw_data` |

Las columnas de imagen, patrones, campos calculados del sistema anterior y
campos vacios no se trasladan a columnas operativas; permanecen en el JSON de
auditoria.

## Reglas de deduplicacion

1. Normalizar telefonos quitando caracteres, `00/54`, `9` movil y ceros de
   troncal cuando la transformacion sea verificable.
2. Vincular por telefono solo si el nombre normalizado es compatible o si otros
   identificadores fuertes (DNI/CUIT) lo confirman.
3. Si un telefono aparece con nombres incompatibles, no fusionar: registrar
   ambiguedad y crear/vincular una identidad separada de manera deterministica.
4. Sin telefono, usar nombre exacto normalizado junto con DNI/direccion cuando
   exista. No usar coincidencia aproximada.
5. Las filas sin nombre se conservan como `Cliente sin identificar - orden N`,
   con marca de revision.
6. No reemplazar campos actuales no vacios con datos historicos.

## Estados historicos

- `retirado` si el Excel marca retiro, incluso sin fecha; sin fecha queda con
  garantia `requiere_revision`.
- `sin_solucion` si esta dado de baja.
- `listo_para_retirar` si fue reparado pero no retirado.
- `presupuestado` si fue presupuestado sin reparacion/retiro.
- `en_revision` para actividad tecnica verificable sin cierre.
- `pendiente_revision` cuando no hay evidencia suficiente.
- Toda combinacion ambigua se importa y queda documentada en la fila de
  auditoria.

## Garantias

- `has_warranty=false` o dias `0`: sin garantia.
- Con garantia y sin retiro: pendiente de entrega.
- Retirada sin fecha: requiere revision.
- Retirada con fecha: inicio = fecha de retiro.
- Vencimiento = inicio + dias.
- Estado visual se calcula con la fecha operativa actual: vigente, vence hoy o
  vencida. `warranty_active` queda solo por compatibilidad, no como fuente de
  verdad.
- Duracion predeterminada configurable en `app_settings`; valor inicial 90
  dias, sin aplicacion retroactiva.

## Implementacion

1. Crear pruebas unitarias de fechas, estados, normalizacion, mapeo y
   deduplicacion.
2. Implementar funciones puras de garantia e importacion.
3. Crear script `import:repair-history` con `--dry-run` predeterminado,
   reporte JSON, respaldo y modo `--apply`.
4. Crear migracion versionada con campos de procedencia, restricciones,
   indices, trigger de garantia, staging/auditoria y RPC transaccional de
   importacion.
5. Ejecutar dry-run contra produccion y bloquear escritura ante errores
   criticos.
6. Aplicar migracion, crear respaldo, importar, ejecutar segunda corrida y
   reconciliar los 261 numeros.
7. Integrar configuracion, detalle, edicion, etiquetas y filtros de garantia.
8. Actualizar RPC segura de tecnicos sin ampliar permisos de edicion
   administrativa.
9. Ejecutar pruebas, typecheck, lint, build, asesores de seguridad/RLS y
   validacion responsive.

## Recuperacion

- El script crea un respaldo JSON local fuera de Git antes de `--apply`.
- Cada fila importada conserva `batch_id`, `order_id`, clave estable y JSON
  original.
- La reversa elimina solo filas del lote seleccionado y sus entidades creadas
  que no tengan referencias externas; nunca modifica ordenes previas al lote.
- La migracion de esquema es aditiva y no elimina columnas existentes.
