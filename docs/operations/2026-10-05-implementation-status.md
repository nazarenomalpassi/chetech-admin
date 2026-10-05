# CHETECH: implementacion del circuito de taller

Fecha: 2026-10-05. Rama: `codex/taller-integral-20261005`.

## Estado real

El paquete principal esta implementado y verificado localmente. **No esta desplegado
en produccion y no representa el cierre de todas las etapas del plan.** Las nuevas
migraciones se aplicaron solamente a bases locales de prueba. No se modificaron
ordenes reales, caja, stock, usuarios ni configuracion fiscal de produccion.

Se trabajo en un worktree aislado. Los cambios preexistentes del checkout original
se conservaron en un commit de base de esta rama, sin limpiar ni sobrescribir ese
checkout. `origin/main` todavia contiene la base inicial y documentacion; esta rama
incluye tambien la aplicacion local previa. Revisar ese alcance antes de integrar.

## Implementado

| Area | Resultado |
| --- | --- |
| Autorizacion del cliente | Aceptar, rechazar y revocar desde mostrador; presupuesto versionado, actor, canal, fecha y motivo. Un cambio de alcance invalida autorizacion y control de calidad sin inventar evidencia historica. |
| Responsables | Asignacion administrativa, toma de orden sin asignar por el tecnico, ubicacion y fecha de proxima accion. Conflictos de version impiden sobrescribir una edicion nueva. |
| Repuestos | Solicitud desde REP, bandeja en Pedidos, compra por mostrador, proveedor/costo/fecha esperada, recepcion parcial, reserva de stock y registro de uso. Compra, ingreso, consumo y pago no se confunden. |
| Taller movil | REP completa, falla y trabajo primero; borradores ante error de red, resultado de guardado visible, formularios por tarea y actualizacion entre dispositivos con pausa durante la edicion. |
| Seguridad | Aprobaciones, compras, entrega y datos financieros protegidos en servidor y PostgreSQL. Historial saneado por rol; fotos privadas, limites de carga y acceso firmado temporal. |
| Entrega | Control de calidad y aprobacion vigentes para marcar listo; devolucion fisica independiente del cobro. Rechazados y sin solucion siguen pendientes de devolver. |
| Cobros | Depositos acumulados y repartidos, reversas auditadas y operaciones atomicas/idempotentes. Se preservan IDs, fechas y actores de proyecciones de caja historicas verificables. |
| Documentos | Ingreso, presupuesto versionado y entrega en PDF; documento interno independiente del pago; acceso a cobro y facturacion desde la REP, sin escritura al abrirlos. |
| Cuotas | Vencimientos ajustados al ultimo dia valido del mes; pagos atomicos y conflictos en ediciones concurrentes. No se recalcularon cuotas reales antiguas. |
| Compras y sueldos | Egresos existentes vinculables a repuesto/REP sin alterar caja; compromisos conocidos pendientes separados de costos desconocidos en la sugerencia de sueldo. |
| Agenda y terceros | Responsable/REP, choques de horarios bloqueados, filtros/paginacion, fecha prometida, retorno, costo real y control de calidad del tercero. |
| Caja y placas | Cierres por cuenta con correcciones auditadas; costo desconocido distinto de cero y liberacion estimada distinta de confirmada en placas. |
| Reportes | Tecnico realmente asignado, cobrado/adeudado, partes y costos incompletos; antiguedad mediana/p90 desde ingreso claramente rotulada, no tiempo ficticio por etapa. |
| Rendimiento y navegacion | Grupos Taller/Comercial/Finanzas/Administracion, productos y ordenes con filtros/paginacion de servidor; fotos e historial completo bajo demanda. |
| Recuperacion | Exportacion operativa verificable y CLI privada; restauracion exacta de 40 tablas / 8.221 filas y 68 relaciones verificadas, sin huerfanos, en base aislada. |
| Fiscal | Integracion preparada para WSAA/WSFEv1, confirmacion explicita por comprobante, numeracion/reintentos protegidos, CAE/PDF/QR y cache compartida cifrada de tickets. Deshabilitada en las pruebas de la app. |

La proyeccion historica de saldos por liberacion estimada de placas no se reescribio
silenciosamente. Antes de cambiar esa semantica financiera, reconciliar las
operaciones existentes con el negocio.

## Evidencia de verificacion

Los comandos se ejecutaron desde esta rama y terminaron con codigo 0, salvo la
auditoria de dependencias indicada mas abajo. No se usaron claves fiscales reales.

| Comprobacion | Resultado |
| --- | --- |
| `npm run test` | 563 tests aprobados; 66 tests de DB optativos omitidos en este comando. |
| Suites DB activadas por separado | Los 66 tests omitidos tambien pasaron: finanzas 18 + 1, fiscal 11, agenda/caja/terceros 11, reportes 18, gastos 1, disponibilidad 2 e historial 4. |
| `scripts/workshop-integration.sql` | 27 suites PostgreSQL aprobadas con roles reales, ataques de escritura directa, versiones, reintentos y rollback de fixtures. |
| `npm run test:staging` | 13 tests del puente local, SDK, sesiones, RLS y Storage. |
| `npm run test:e2e` | HTTP/PostgREST real: venta/stock, autorizacion, solicitudes/recepcion, comprobante, cobro parcial/completo y reversa sin entrega. No es cobertura completa de clics de todos los modulos. |
| `npm run test:app` | Rutas Next autenticadas, limites de tecnico, fiscal deshabilitado, PDF privado real y foto privada con acceso firmado. |
| `npm run lint`, `npm run typecheck` | Aprobados. |
| `npm run build` | Compilacion Next.js 15.5.25 aprobada. |
| Navegador de pruebas | Guardado tecnico real y lectura desde mostrador; lista de ordenes para ambos roles en 360/390/430/768/1024/1366/1920 px sin overflow global. |
| Privacidad | Archivos privados, backups, variables reales y claves fuera de Git; no se publica el contenido de las bases exportadas. |

Las capturas del trabajo son privadas en `tmp/backups/`. Una captura o viewport de
navegador no equivale a validar Safari/PWA en un iPhone fisico.

## Pendientes que impiden el cierre del plan

1. **Release seguro:** habilitar acceso al proyecto correcto de Vercel, reconciliar
   revision publicada/migraciones y revisar la compatibilidad del portal/tienda.
   La sesion Vercel disponible no tiene acceso a CHETECH. No publicar en otra cuenta.
2. **Migracion integral:** ensayar el upgrade completo desde una copia del esquema
   real, incluyendo funciones/politicas compartidas, antes de aplicar nuevas
   migraciones a produccion. Las suites por bloque no sustituyen este ensayo.
3. **Recuperacion completa:** completar restauracion PostgreSQL, roles/Auth,
   secuencias, configuracion y archivos Storage. La restauracion de datos
   operativos ya verificada no cubre esos componentes ni las claves de usuarios.
4. **ARCA:** confirmar habilitacion de servicios, certificado/clave, punto de venta
   Web Services y datos tributarios con el contador; realizar homologacion real y
   conciliacion antes de activar produccion. No se habilitaron servicios ni se
   emitio ninguna factura fiscal real. La emision seguira siendo una accion
   explicita, nunca automatica para todas las reparaciones.
5. **Piloto presencial:** una PC y al menos dos celulares, Wi-Fi/datos, segundo
   plano/PWA, renovacion de sesion y perdida de red. Medir latencias reales y usar
   nuevas ordenes durante una semana antes de extender el flujo a todo el taller.
6. **Tareas y contacto:** completar lectura/acuse individual de pendientes,
   registro manual de contacto y ficha consolidada de cliente. No se simulan
   mensajes enviados, leidos ni notificaciones personales.
7. **Documentos restantes:** recibo numerado por cada cobro, resumen final separado,
   plantillas configurables, rectificaciones y eventual formato termico. Validar
   impresion visual con documentos reales anonimizados e impresora del local.
8. **Inventario ampliado:** compras agrupadas para varias REP, ubicaciones por
   recepcion, devolucion de partes instaladas y devoluciones comerciales/placas
   con impacto financiero controlado. El flujo implementado es por solicitud.
9. **Metricas avanzadas:** duracion verdadera por fase, cohorte de garantias y
   retrabajo, tiempos de aceptacion a avance, contactos pendientes y telemetria
   operativa. No sustituir esas medidas por antiguedad total de ingreso.
10. **Uso compartido:** acordar una cuenta de mostrador y elevacion/bloqueo para
    acciones sensibles. No se altero autenticacion ni se atribuye una accion
    personal a quien use una cuenta administradora compartida.

## Riesgo de dependencia conocido

`npm audit --omit=dev` informa una vulnerabilidad alta sin correccion publicada en
`node-forge` 1.4.0: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
relacionada con verificacion RSA PKCS#1 v1.5. El modulo usa firma CMS con claves de
servidor confiables y no usa esa ruta de verificacion vulnerable. Esto reduce el
alcance conocido, pero **no equivale a una auditoria de dependencias sin riesgos**.
Revisar nueva version o sustitucion antes de activar la integracion fiscal real.

## Siguiente checkpoint

Revisar el paquete en GitHub, resolver acceso y habilitacion fiscal pendientes,
completar los ensayos de upgrade/recuperacion y aprobar un piloto limitado. No
fusionar ni desplegar solo porque compila. Conservar el esquema aditivo al revertir
la aplicacion; nunca borrar operaciones reales para corregir un error de release.
