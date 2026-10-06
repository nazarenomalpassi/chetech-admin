# Reconciliacion de numeros de orden de reparacion

Fecha de ejecucion: 2026-07-27
Proyecto Supabase: `ocdijruwaiwnmjmuvxzr`
Ejecucion de respaldo en base: `8f4108b8-9fe8-41f3-94bb-daed128ba700`

## Resultado

La correccion se aplico en produccion sin borrar ordenes, recrear clientes ni
modificar UUID. El numero entero `order_number` es ahora la fuente de verdad y
`repair_number` queda sincronizado en formato `REP-000000`.

Estado al aplicar la migracion:

- 384 ordenes analizadas.
- 261 ordenes historicas importadas renumeradas.
- 3 ordenes posteriores a la importacion renumeradas.
- 120 ordenes originales del sistema actual preservadas sin cambios.
- Maximo anterior: 649.
- Maximo corregido inmediatamente despues de la migracion: 388.
- Siguiente numero preparado por la migracion: 389.

Durante la validacion se creo una orden operativa real desde la aplicacion. El
trigger le asigno correctamente `REP-000389`. Por eso el estado actual es:

- 385 ordenes reales.
- Maximo actual: 389.
- Proximo numero: 390.

## Causa

La funcion historica de importacion insertaba cada fila del Excel usando
`generate_repair_access_number()`. Esa llamada consumia la misma secuencia
reservada para ordenes operativas. Como resultado, las filas del sistema
anterior recibieron numeros 386 a 646 y las altas posteriores comenzaron en
647.

## Evidencia y criterio

La fuente real no contiene 265 filas como se esperaba inicialmente:

- `Service Exporado.xlsx` contiene 261 filas de ordenes.
- Los numeros originales registrados van de 1 a 266.
- Faltan en la fuente los numeros 2, 4, 152, 158 y 199.
- No se inventaron cuatro ordenes inexistentes para rellenar esos huecos.

Para respetar el final historico 265 con el menor cambio posible se cerro el
ultimo hueco comprobado, 199:

- Los numeros originales hasta 198 conservan su valor.
- Los originales 200 a 266 se desplazan una posicion.
- El original 266 queda como orden publica 265.
- Permanecen como huecos documentados 2, 4, 152 y 158.

La evidencia de la base y del Excel tampoco coincide con la descripcion del
equipo de la orden 646: esa fila estaba identificada de forma estable por
`legacy_order_number = 266`. Se priorizo ese metadato y no se altero ningun dato
del cliente o equipo para intentar forzar una coincidencia por descripcion.

## Mapeo aplicado

- Historicas importadas: rango publico 1 a 265, con huecos 2, 4, 152 y 158.
- Sistema actual original: 266 a 385, sin cambios.
- Anterior 646: 265.
- Anterior 647: 386.
- Anterior 648: 387.
- Anterior 649: 388.
- Primera alta posterior a la correccion: 389.

## Integridad validada

- 384 de 384 UUID respaldados siguen presentes.
- 0 cambios de cliente.
- 0 cambios de equipo.
- 0 cambios de fecha de ingreso.
- 0 cambios de `created_at`.
- 0 numeros duplicados.
- 0 numeros nulos.
- 0 numeros no positivos.
- 0 inconsistencias entre `order_number` y `repair_number`.
- 0 relaciones huerfanas en estados, importaciones, pagos, presupuestos,
  actualizaciones de cliente, tercerizaciones y reparaciones vinculadas.
- 44 reparaciones vinculadas conservan el UUID y el numero publico sincronizado.

## Alcance tecnico

Tablas y datos:

- `public.repair_access_orders`: se agregaron `order_number`,
  `numbering_source`, `numbering_reconciled_at` y
  `numbering_reconciliation_id`; solo se corrigio la numeracion publica.
- `public.repairs`: se sincronizo su copia textual de `order_number` para los
  44 enlaces existentes.
- `private.repair_order_number_reconciliation_runs`,
  `private.repair_order_number_reconciliation_backup` y
  `private.repair_order_number_link_backup`: respaldo y trazabilidad privados.
- No se modificaron UUID, clientes, equipos, fechas funcionales, pagos,
  garantias ni historiales.

Objetos de base:

- Secuencia `public.repair_access_order_number_seq`.
- Trigger `private.sync_repair_access_order_number`.
- RPC `public.save_repair_access_intake(jsonb)`.
- RPC `public.import_repair_history_transaction(jsonb)`.
- Funcion restringida
  `public.rollback_repair_order_number_reconciliation(uuid)`.

## Protecciones agregadas

- Indice unico para `repair_access_orders.order_number`.
- Restricciones de rango, origen y formato.
- Trigger `private.sync_repair_access_order_number`.
- Secuencia limitada y sincronizada con el maximo real.
- Bloqueo asesor compartido por altas e importaciones.
- El RPC de alta ya no solicita un numero por separado: el trigger lo asigna
  dentro del mismo `INSERT`.
- La funcion heredada `generate_repair_access_number()` ya no puede ejecutarse
  desde `anon`, `authenticated` ni `service_role`.
- Los intentos de insertar o modificar manualmente un numero publico se
  rechazan en la base.
- Importador idempotente con numero publico explicito.
- Rechazo transaccional de numeros historicos invalidos, repetidos u ocupados.
- Los reintentos exactos de una orden historica ya importada se reconocen y
  omiten sin colisionar con su propio numero.
- Tablas privadas de ejecucion, respaldo y enlaces.
- Funcion de rollback `SECURITY DEFINER`, restringida a `service_role`, con
  validacion adicional de reparaciones vinculadas.
- Registro en `audit_logs`.

## Pruebas

- Preflight previo con 384 ordenes y mapeo unico.
- Dry-run posterior: 385 ordenes, 0 cambios pendientes.
- Reejecucion del importador: 261 omitidas, 0 nuevas, 0 errores y secuencia sin
  cambios.
- Alta operativa real: `REP-000389`.
- Prueba concurrente: dos altas simultaneas recibieron 390 y 391 sin
  duplicarse; luego se eliminaron y la secuencia se restauro a 389 bajo bloqueo.
- Alta automatica posterior al endurecimiento: recibio 390; se elimino dentro
  de la prueba y la secuencia quedo nuevamente en 389.
- Insercion y edicion manual de numeros: ambas rechazadas por PostgreSQL.
- Reintento transaccional de una orden historica: 0 insertadas, 1 omitida; el
  lote y sus filas de prueba se revirtieron por completo.
- Rollback invocado con `service_role`: alcanzo correctamente la proteccion que
  impide revertir despues de la orden real 389, sin errores de permisos.
- 126 pruebas automatizadas aprobadas.
- `npm run typecheck` aprobado.
- `npm run lint` aprobado.
- `npm run build` aprobado.

## Respaldo y rollback

Respaldo externo previo:

`tmp/backups/repair-order-numbers-before-2026-07-27T14-55-46-000Z.json`

La funcion disponible es:

```sql
select public.rollback_repair_order_number_reconciliation(
  '8f4108b8-9fe8-41f3-94bb-daed128ba700'::uuid
);
```

La funcion se bloquea intencionalmente si se agregaron o eliminaron ordenes
despues de la reconciliacion. Como ya existe la orden real 389, no debe
ejecutarse directamente. Si fuera necesario volver atras, primero se debe crear
una migracion asistida que preserve y reubique las altas posteriores usando el
respaldo externo y las tablas privadas.

## Archivos principales

- `supabase/migrations/20260727145611_reconcile_repair_access_order_numbers.sql`
- `supabase/migrations/20260727152851_harden_repair_order_numbering.sql`
- `supabase/migrations/20260727153208_fix_repair_number_override_guard.sql`
- `scripts/reconcile-repair-order-numbers.ts`
- `scripts/import-repair-history.ts`
- `src/features/repairs-access/order-number-reconciliation.ts`
- `src/features/repairs-access/order-number-reconciliation.test.ts`
- `src/features/repairs-access/history-import.ts`
- `src/features/repairs-access/history-import.test.ts`
- `src/features/repairs-access/actions.ts`
- `src/lib/db/types.ts`
