# Reporte de importacion historica

## Resumen

| Control | Resultado |
| --- | ---: |
| Filas leidas y normalizadas | 261 |
| Ordenes insertadas | 261 |
| Clientes nuevos | 28 |
| Clientes existentes vinculados | 165 |
| Ordenes vinculadas a clientes existentes | 225 |
| Filas invalidas | 0 |
| Colisiones con ordenes actuales | 0 |
| Coincidencias ambiguas | 4 |
| Ordenes con datos para revisar | 16 |
| Retiradas sin fecha efectiva | 8 |

La segunda ejecucion encontro `0` ordenes nuevas y omitio las `261` ya importadas.

## Coincidencias ambiguas

No se fusionaron identidades cuando un telefono aparecia asociado a personas incompatibles.
Se crearon identidades separadas para las ordenes historicas `1`, `65`, `204` y `208`.

El detalle privado con los nombres y candidatos queda en
`reports/repair-history-import/latest-apply.json`, excluido de Git.

## Registros para revision

- Retirados sin fecha efectiva: `3`, `5`, `7`, `17`, `30`, `44`, `46`, `50`.
- Sin nombre verificable: `107`, `204`, `254`.
- Sin detalle de falla: `32`, `169`, `207`, `254`, `266`.
- Sin tipo de equipo: `176`, `207`, `254`, `266`.

No se inventaron fechas, clientes, equipos ni fallas. Los campos faltantes usan una marca
operativa y la causa exacta permanece en `repair_access_import_rows.review_reasons`.

## Reconciliacion posterior

- `261` ordenes con `legacy_order_number` unico.
- `261` claves `import_row_key` unicas.
- `261` clientes y `261` equipos vinculados a sus ordenes.
- `261` filas originales sanitizadas disponibles para auditoria.
- `0` garantias pendientes de retiro corriendo por error.
- `0` diferencias entre retiro + dias y vencimiento guardado.
- Plazos: `60 dias = 73`, `90 dias = 29`, `360 dias = 12`.
- Las `120` ordenes preexistentes se conservaron.
- RLS sigue activo en lotes y filas de importacion; las RPC de importacion y reversa solo
  tienen permiso de ejecucion para `service_role`.
