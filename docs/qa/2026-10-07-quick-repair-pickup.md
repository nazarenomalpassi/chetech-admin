# Retiro desde Actualizar trabajo

## Alcance

- Opcion `Retirado por cliente` en el selector rapido de administracion, web y mobile.
- Persona que retira, accesorios/observaciones y confirmacion explicita en la misma ficha.
- La entrega reutiliza `workshop_deliver`: no actualiza el estado mediante el guardado tecnico.
- Sin migraciones, cambios de roles, modificaciones de importes ni cobros automaticos.
- Se mantienen los requisitos de estado listo/devolucion y la autorizacion motivada de saldo pendiente.
- Los borradores conservan campos condicionales al alternar estados.
- Un retiro exitoso bloquea la ficha hasta que llegue la actualizacion del servidor.

## Verificacion

- Pruebas red/green para selector, entrega, roles, confirmacion, motivo, conflictos, alternancia de campos y bloqueo posterior.
- Ensayo end-to-end en PostgreSQL/PostgREST/Next aislados, solo con orden sintetica REP-000977.
- Guardado previo del presupuesto/confirmacion/calidad: `listo_para_retirar`, version 4.
- Intento de retiro sin autorizacion de saldo: rechazado por el RPC existente; borrador conservado.
- Retiro con autorizacion y motivo: `retirado`, version 5, picked_up_at y delivered_at registrados, un solo evento de entrega.
- Presupuesto 100 e is_paid=false sin cambios durante la entrega.
- Hash de movimientos_caja antes/despues: `24e42e4420e491a682332ca4630871a8`.
- Hash de repair_payments antes/despues: `617fba8160cbb8be445c811c3dabb363`.
- Vista de 390 px: ancho de documento 380 px, sin desborde horizontal.
- Capturas de la prueba en `tmp/qa/quick-pickup-20261007/` (ignoradas por Git).
- Suite completa: 781 pruebas aprobadas, 69 pruebas opt-in omitidas; lint y typecheck aprobados.
- Smoke autenticado de la app: permisos tecnicos, emision fiscal deshabilitada, PDF privado y fotos privadas aprobados.
- No se registraron retiros ni operaciones ficticias en produccion. No se probo en un iPhone fisico.
