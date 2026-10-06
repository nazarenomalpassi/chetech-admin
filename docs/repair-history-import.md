# Historial de reparaciones y garantias

## Resultado aplicado

- Proyecto Supabase: `ocdijruwaiwnmjmuvxzr`
- Archivo: `Service Exporado.xlsx`
- Hoja: `Hoja1`
- Lote aplicado: `311867ad-016b-49ab-99df-d10dcf08cb2d`
- Ordenes historicas: `261`
- Clientes nuevos: `28`
- Ordenes vinculadas a clientes existentes: `225`
- Coincidencias ambiguas separadas: `4`
- Ordenes retiradas sin fecha, marcadas para revision: `8`

La importacion conserva el numero anterior en `legacy_order_number`, una clave idempotente
en `import_row_key` y la fila original sanitizada en `repair_access_import_rows.raw_data`.
Los passwords del sistema anterior no se guardan.

## Volver a ejecutar

Desde la raiz del proyecto:

```powershell
cd "C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai"
npm run import:repair-history -- "C:\Users\nazar\Downloads\Service Exporado.xlsx" --dry-run
```

El dry-run debe informar `ordersNew: 0`, `ordersSkipped: 261`, cero errores criticos y
`applyReady: true`. Si se solicita escritura otra vez, la clave unica evita duplicados:

```powershell
npm run import:repair-history -- "C:\Users\nazar\Downloads\Service Exporado.xlsx" --apply --confirm=IMPORT-261
```

Los reportes locales se escriben en `reports/repair-history-import/` y los respaldos previos
a cada operacion destructiva en `tmp/backups/`. Esos archivos contienen datos privados y
estan excluidos de Git.

## Revertir el lote

La reversa elimina solamente las ordenes, equipos y clientes creados por el lote indicado.
Antes de ejecutarla, el script genera un nuevo respaldo JSON.

```powershell
npm run import:repair-history -- --rollback=311867ad-016b-49ab-99df-d10dcf08cb2d --confirm=ROLLBACK-311867ad-016b-49ab-99df-d10dcf08cb2d
```

No ejecutar la reversa durante la operacion normal del local. Si una orden importada ya fue
editada o relacionada con datos posteriores, revisar primero el respaldo y las filas de
auditoria.

## Regla de garantia

La garantia comienza exclusivamente en `picked_up_at`, la fecha efectiva de retiro. El
vencimiento es `fecha de retiro + warranty_days`. El estado visible se calcula contra la
fecha actual de Buenos Aires, por lo que no depende del booleano historico
`warranty_active`.
