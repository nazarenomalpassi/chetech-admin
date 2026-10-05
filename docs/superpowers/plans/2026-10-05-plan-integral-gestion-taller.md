# CHETECH: plan integral de gestión, taller y comprobantes

> **Guía para implementación posterior:** ejecutar cada etapa con `executing-plans`, pruebas de regresión y una revisión antes de publicar. Este documento es un plan; no autoriza ni ejecuta cambios en producción. Las casillas representan trabajo futuro.

**Objetivo:** conectar mostrador, técnicos, repuestos, clientes y cobros para que ninguna reparación dependa de la memoria de una persona.

**Arquitectura:** evolucionar el sistema actual, sin reescribirlo. Mantener una orden REP como referencia central, agregar registros vinculados de aprobación, tareas y repuestos, y conservar separados el trabajo técnico, el dinero y la entrega física. Incorporar cambios mediante migraciones aditivas y activación gradual.

**Tecnologías actuales:** Next.js 15, React 19, TypeScript, Supabase/Postgres, React Hook Form, Zod, Tailwind, PDFKit, Vitest y Vercel.

**Fecha del análisis:** 5 de octubre de 2026.

---

## 1. Conclusión para el dueño

CHETECH ya tiene una base amplia: ventas, stock, cobros repartidos, caja, reparaciones, garantías, visitas, placas, cuotas, sueldos, reposición y reportes. No empezaría de cero ni compraría otro sistema antes de ordenar lo que ya existe.

La carencia principal no es otra sección: es un **circuito de trabajo compartido**. Hoy se pueden cargar muchos datos, pero falta que una acción de mostrador genere una tarea clara para el taller y viceversa.

La primera versión que recomiendo debe resolver cinco preguntas en cada orden:

1. ¿Qué le pasa al equipo y dónde está?
2. ¿Quién tiene que hacer el próximo paso?
3. ¿El cliente autorizó este presupuesto concreto?
4. ¿Falta un repuesto, quién lo compra y cuándo llega?
5. ¿Está reparado, cobrado y entregado? Son tres respuestas distintas.

**Prioridad inmediata:** botón de confirmación del cliente, solicitud de repuestos desde la orden, responsables y avisos entre mostrador y taller. Después, robustecer cobros y documentos; finalmente, reportes y pulido visual.

**No prometo un sistema “100% perfecto”.** La meta verificable es reducir olvidos, impedir inconsistencias conocidas y contar con pruebas, trazabilidad y recuperación cuando algo falle.

## 2. Alcance y límites de esta revisión

Se revisaron rutas, navegación, permisos, formularios, acciones de servidor, consultas, migraciones relevantes, generación de comprobantes y el informe técnico previo del repositorio. Se contrastó el producto con documentación oficial de sistemas especializados.

**Confirmado** significa que el comportamiento está presente en el código leído. **Riesgo** significa que el diseño permite un problema, no que se haya demostrado que ya ocurrió con tus datos. **Propuesta** es una mejora futura.

No se modificaron órdenes reales, stock, saldos, usuarios, Supabase ni despliegues. No se realizó una nueva prueba completa de escritura en producción, ni una medición física de tu Wi-Fi, ni una sesión real en los celulares del taller. Por eso no atribuyo tus problemas de conexión exclusivamente a la red o al servidor.

La revisión local tampoco demuestra por sí sola que cada archivo coincida con la versión desplegada. La primera etapa incluye reconciliar código, GitHub, migraciones y versión publicada. Los resultados del informe de octubre previo son antecedentes, no pruebas nuevas de esta revisión.

**Supuestos de trabajo:** mostrador administra comunicación, aprobación comercial y cobros; el técnico diagnostica, solicita partes y registra avances. La facturación fiscal se trata como una etapa opcional hasta confirmar cómo emitís hoy y qué necesita tu contador.

## 3. Comparación con sistemas especializados

Estos son referentes útiles para tu nicho, no un ranking absoluto de “los cinco mejores”. La comparación se basa en funcionalidades documentadas por los proveedores; no contraté ni probé sus plataformas, ni comparé precios o soporte argentino.

| Referente | Práctica documentada que sirve para CHETECH | Diferencia y aplicación propuesta |
| --- | --- | --- |
| **Orderry** | Presupuestos con aceptación del cliente y compras iniciadas desde la orden de trabajo. | Vincular aprobación y solicitud de repuesto a la REP, sin recargar la misma información en distintas pantallas. |
| **RepairShopr** | Tickets con responsable, seguimiento de partes y un tablero del local que se refresca automáticamente. | Que mostrador y taller compartan pendientes actualizados y sepan quién debe actuar. |
| **RepairDesk** | Recepción, fotos, repuestos, presupuestos y cobro conectados en el flujo de reparación. | Completar la trazabilidad del equipo desde ingreso hasta devolución, conservando tus cobros divididos actuales. |
| **Fixably** | Cola de reparaciones con asignación, historial y pasos guiados. | Simplificar la ficha del técnico y reemplazar decisiones ambiguas por acciones concretas y verificables. |
| **Odoo Repairs** | Órdenes relacionadas con piezas, movimientos de inventario y venta del servicio. | Tomar como referencia el vínculo entre repuesto solicitado, utilizado y costo, sin adoptar un ERP entero. |

Fuentes que sostienen la comparación: [aprobación en Orderry](https://help.orderry.com/en/articles/9130810-how-to-send-an-estimate-to-a-client-for-approval), [compras desde órdenes en Orderry](https://help.orderry.com/en/articles/14823340-how-to-create-a-purchase-order-from-a-work-order), [funciones de RepairShopr](https://www.repairshopr.com/features), [flujo de RepairDesk](https://www.repairdesk.co/cell-phone-repair-shop-software/), [gestión de órdenes de Fixably](https://www.fixably.com/features/repair-order-management) y [órdenes de reparación de Odoo 18](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/repairs/repair_orders.html).

**Mi recomendación para tu local:** combinar la claridad de órdenes y compras de Orderry con la visión compartida de taller de RepairShopr. Es una inferencia de diseño para CHETECH, no una recomendación de migración. No hace falta copiar funciones de franquicias, marketing o ecommerce que hoy no resuelven tu problema.

## 4. Hallazgos concretos en CHETECH

| Prioridad | Hallazgo y evidencia | Consecuencia y tratamiento |
| --- | --- | --- |
| Alta | Ya existe `presupuestado_aceptado` en el flujo principal, dentro del selector de estados. Hay fecha/notas de respuesta, pero no una aprobación inmutable de una versión del presupuesto. | No crear otro estado equivalente: agregar una acción comercial explícita con monto, versión, usuario y canal. |
| Alta | Los técnicos pueden enviar cualquiera de los ocho estados admitidos por sus RPC, incluidos aceptación y retiro. | Separar permisos de diagnóstico, aprobación comercial y entrega. El control debe estar en servidor/DB, no solo en botones. |
| Alta | El formulario técnico completo vuelve a escribir `budget_response_at` al editar una orden aceptada/rechazada y lo limpia en otros estados. El formulario rápido aplica una regla diferente. | Unificar reglas y guardar decisiones como eventos; editar un diagnóstico no debe alterar cuándo autorizó el cliente. |
| Alta | `Pedidos` está construido alrededor de producto, mes y cantidad a reponer. No representa solicitudes de repuesto vinculadas a una REP. | Extender Pedidos con una bandeja de repuestos de taller. No reemplazar la reposición comercial. |
| Alta | Las acciones revalidan páginas, pero no encontré suscripciones ni actualización periódica entre dispositivos abiertos en el código revisado. | Puede haber información desactualizada aunque el guardado haya funcionado. Medirlo y agregar sincronización segura. No equivale a demostrar una falla de Wi-Fi. |
| Alta | Hay historial de cambios de estado en base, pero no se expone como una línea de tiempo completa en la consulta de la ficha. Los avances actuales son campos editables. | Mostrar historia legible y registrar nuevos avances sin borrar los anteriores. Reutilizar la auditoría existente. |
| Alta | La sincronización desde cobros de reparaciones marca la orden como `retirado` y completa fecha de retiro. | Cobrar no debe significar entregar. Separar seña, saldo y devolución física del equipo. |
| Alta | Al guardar un comprobante interno se asigna `paid_total = total`, `balance = 0` y `status = pagado`. La selección de reparación vinculada no garantiza por sí sola que esté cobrada. | Emitir un documento no debe inventar un cobro. Derivar pagado/saldo de pagos efectivos vinculados. |
| Alta | Guardar el comprobante elimina y reconstruye detalles/pagos mediante varias operaciones separadas. | Existe riesgo de escritura parcial ante una falla intermedia. Hacer la operación transaccional y probar fallos controlados antes de publicar. |
| Media | Rechazadas y sin solución se consideran cerradas para algunas vistas del taller. | El equipo puede seguir físicamente en el local. Mantenerlo en “Pendiente de devolver” hasta su entrega real. |
| Media | Se leen páginas de registros para evitar pérdidas de historial, pero después se entrega un conjunto grande al cliente. | No confundir paginar la lectura de Supabase con paginar la pantalla. Agregar filtros y paginación de servidor. |
| Media | Las cuotas usan `Date.setMonth` sin regla de fin de mes. La reproducción aislada de 31/01/2026 + 1 mes da 03/03/2026. | Definir vencimiento al último día válido del mes destino; no recalcular cuotas históricas silenciosamente. |
| Media | El PDF de comprobantes usa posiciones y separaciones fijas para filas y totales. | Riesgo de superposición con descripciones largas o muchos renglones. Agregar medición de contenido, saltos de página y pruebas visuales. |
| Alta | El Excel de backup exporta siete conjuntos de datos y no incluye todo el dominio moderno del taller. | No presentarlo como recuperación completa. Separar exportación operativa de backup restaurable de base y archivos. |

Referencias principales del código inspeccionado:

- [Estados y cierres de reparaciones](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/repairs-access/components/repair-access-helpers.ts).
- [Actualización técnica y respuesta del cliente](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/repairs-access/actions.ts:251).
- [Permisos y funciones del técnico](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/supabase/migrations/20260714214629_harden_technician_data_boundaries.sql).
- [Modelo actual de Pedidos](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/replenishment/types.ts).
- [Acoplamiento entre cobro y retiro](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/repairs/repair-access-sync.ts:28).
- [Guardado y estado pagado del comprobante](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/invoices/actions.ts:107).
- [Fechas de cuotas](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/features/installments/model.ts:19), [generación del PDF](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/app/api/invoices/[id]/pdf/route.ts) y [exportación de backup](C:/Users/nazar/OneDrive/Escritorio/Chetarda-ai/src/app/api/backup/route.ts).

Importante: el módulo histórico de pagos tiene otros estados, incluido espera de repuestos. Eso no reemplaza un circuito de partes en el módulo principal de órdenes. No recomiendo mantener dos tableros técnicos paralelos.

## 5. Circuito propuesto para una reparación

### 5.1 Un recorrido principal, sin mezclar conceptos

**Ingreso → diagnóstico → presupuesto → autorización → reparación → control de calidad → listo para retirar → entrega.**

La espera del cliente o de un repuesto puede bloquear el trabajo. Una reparación rechazada o sin solución pasa a devolución, no desaparece del taller. Una garantía abre un caso vinculado a la orden original, sin reescribirla.

No convertir todas las combinaciones posibles en un selector de treinta estados. Mantener dimensiones separadas:

| Dimensión | Qué responde | Ejemplos |
| --- | --- | --- |
| Trabajo técnico | ¿Qué está haciendo el taller? | Ingreso, diagnóstico, reparación, pruebas, listo. |
| Presupuesto | ¿Qué autorizó el cliente? | Borrador, informado, aceptado, rechazado, reemplazado por otra versión. |
| Bloqueo | ¿Por qué no avanza? | Espera cliente, falta repuesto, espera tercero; pueden coexistir. |
| Cobro | ¿Cuánto ingresó realmente? | Sin cobro, seña/parcial, completo, devolución. |
| Custodia | ¿Quién tiene el equipo? | Mostrador, taller/estante, tercero, entregado. |

La interfaz mostrará un estado principal y, como máximo, dos alertas relevantes; el resto quedará dentro de la ficha. Introducir estas dimensiones gradualmente, manteniendo compatibilidad con los códigos históricos.

### 5.2 Botón “El cliente confirmó la reparación”

**Disponible para mostrador/admin**, en órdenes con presupuesto informado y sin una aceptación vigente. Para el técnico, mostrar el resultado, no permitir que apruebe en nombre del cliente por cambiar un selector.

Al pulsarlo, un modal mostrará REP, cliente, detalle del trabajo, versión del presupuesto e importe autorizado. Pedirá canal de confirmación: presencial, teléfono, WhatsApp del negocio o portal. Fecha/hora y usuario se registrarán automáticamente; se permitirá agregar una nota y evidencia opcional.

**Al confirmar:** guardar la aceptación y el evento en una sola operación, cambiar la indicación comercial de la orden, crear la próxima tarea y avisar al técnico asignado. Si falta una parte, indicar “Autorizada; pendiente de repuesto”, no “Lista para reparar”.

Reglas necesarias:

- La aprobación autoriza trabajo por el monto y alcance mostrados; no registra dinero ni descuenta stock.
- Un doble clic o un reintento de red no crea aprobaciones ni avisos duplicados.
- Si cambió el presupuesto en otra pantalla, se rechaza la aprobación desactualizada y se muestra la versión nueva.
- Una corrección que cambia importe o alcance genera nueva versión y nueva autorización. No se altera una aceptación anterior.
- Una aceptación cargada por error se revoca con usuario y motivo; no se borra el historial.
- “Cliente rechazó” requiere motivo opcional y genera pendiente de devolución si el equipo sigue en el local.
- En históricos solo se mostrará la evidencia que existe. No inventar canal, fecha precisa, usuario o importe autorizado.

**Ejemplo:** el técnico propone $80.000. Mostrador registra que el cliente aceptó por teléfono. El técnico ve “Autorizado por $80.000, registrado por mostrador”. Si después necesita ampliar a $95.000, debe solicitar una nueva autorización antes del trabajo adicional.

### 5.3 Repuestos que no se olvidan

Dentro de la orden, agregar **“Solicitar repuesto”**. El técnico cargará descripción/código, equipo compatible, cantidad, urgencia y, si ayuda, foto o enlace. La REP y el solicitante se completarán solos.

La solicitud deberá persistir como registro, aparecer inmediatamente en **Pedidos → Repuestos de taller** y generar una tarea para quien compra. Es más importante este paso simple que empezar con un sistema de compras enorme.

Flujo ampliado:

**Solicitado → por cotizar/autorizar → comprado → recibido parcial/completo → asignado a REP → utilizado/devuelto.**

- Mostrador/compras ve responsable, proveedor, costo estimado/real, fecha esperada y órdenes afectadas. El técnico ve disponibilidad y fecha, no necesita ver márgenes financieros.
- Se puede solicitar antes de la aceptación para cotizar. La compra queda bloqueada hasta autorización comercial o una excepción administrativa documentada.
- Si la parte ya existe, reservarla para esa orden; pedir no significa descontar ni comprar.
- Una compra puede cubrir varias órdenes; cada cantidad tiene su destino. Recibir parcialmente no habilita todas las reparaciones.
- “Recibido” exige identificar cantidad y ubicación; avisa a los técnicos de las REP que realmente recibieron material.
- Un doble clic no duplica la solicitud. Dos técnicos que piden la última unidad deben recibir una respuesta consistente.
- Cancelar una reparación libera reservas y abre una decisión sobre partes ya compradas. No borrar automáticamente una compra efectuada.
- Compra, pago al proveedor, entrada de inventario y consumo en reparación son hechos distintos. Vincularlos sin duplicar egresos ni costos.

La creación de compras desde la orden, descontando lo ya pedido, tiene un precedente útil en [Orderry](https://help.orderry.com/en/articles/14823340-how-to-create-a-purchase-order-from-a-work-order). Las reglas anteriores son la adaptación propuesta para CHETECH.

### 5.4 Pantallas para mostrador y taller

| Mostrador | Técnico en celular |
| --- | --- |
| Presupuestos pendientes de enviar y responder. | Mis órdenes y órdenes sin asignar. |
| Solicitudes de repuestos por gestionar. | Autorizadas para empezar y repuestos recibidos. |
| Equipos listos sin aviso o sin retirar. | Falla, equipo, última novedad y siguiente paso. |
| Compromisos de entrega y visitas de hoy. | Agregar avance, solicitar parte, informar presupuesto, pasar a pruebas. |
| Señales de cobro pendiente, sin confundirlas con autorización. | Sin saldos, sueldos ni botones de contacto desde el teléfono personal. |

En toda tarjeta: REP completa sin puntos suspensivos, cliente/equipo, técnico, próxima acción, bloqueo, antigüedad y ubicación. En celular, una lista de tarjetas y filtros; no un tablero horizontal ancho obligatorio.

“Mis órdenes” es una vista de trabajo, no necesariamente una prohibición de colaborar. Si un técnico toma una orden ajena o sin asignar, debe quedar registrado quién asumió la tarea. Una transferencia de responsable no debe borrar el trabajo anterior.

### 5.5 Avisos y sincronización entre dispositivos

Primero medir cuatro casos: guardado no confirmado, guardado correcto pero otra pantalla vieja, formulario sobrescrito y sesión vencida. Registrar tiempos e identificador de operación sin exponer datos personales en los logs.

Propuesta técnica: eventos persistidos de orden/tarea, un canal seguro de cambios y actualización dirigida de la lista. Usar permisos reales para que un técnico no reciba tablas financieras completas. Si la conexión de eventos falla, consultar cambios con intervalo limitado mientras la pestaña está visible, con pausa y reintento progresivo ante errores.

- Mostrar “Guardando”, “Guardado en el servidor” o “No se pudo guardar”. Un borrador local nunca se presentará como guardado compartido.
- Al volver de segundo plano, reconectar y comprobar novedades. Probar especialmente PWA/iPhone.
- Si alguien está escribiendo, no reemplazar su formulario automáticamente. Avisar “Esta orden cambió” y permitir revisar diferencias.
- Cada edición lleva una versión esperada. Si otra persona guardó antes, no aplicar silenciosamente datos viejos sobre nuevos.
- Los avisos importantes tienen destinatario, leído y resuelto. Leer no resuelve la tarea.
- Evitar una alerta por cada tecla: solo autorización/rechazo, solicitud/recepción de parte, asignación, listo y conflicto de guardado.
- No programar envíos automáticos de WhatsApp desde cuentas personales. Inicialmente usar la cuenta del negocio desde mostrador y registrar el contacto.

Objetivo inicial a medir: cambios visibles en otro dispositivo activo en menos de 5 segundos con red normal; actualización alternativa dentro de 30 segundos si cae el canal principal. Son metas de aceptación, no resultados medidos hoy.

## 6. Ingreso, reparación, entrega y garantía

### Ingreso rápido pero completo

Conservar el asistente actual y los campos de cliente, equipo, falla, accesorios y condición. No pedir diagnóstico ni precio final antes de revisar el aparato.

Agregar fotografías privadas del estado, ubicación física, responsable y próxima fecha de revisión. Generar etiqueta REP/QR y comprobante de ingreso con accesorios recibidos. El QR interno debe abrir una orden autenticada; no publicar teléfono o datos del cliente en el código.

Reutilizar cliente y equipo por teléfono normalizado, modelo y serie, mostrando posibles coincidencias para evitar duplicados. Una fusión de clientes requerirá confirmación y conservación de todas las órdenes. No exigir DNI o correo para cualquier reparación si no son necesarios para la operación.

Para televisores y placas: registrar código de placa además de modelo del televisor cuando corresponda. Para computadoras/celulares: registrar autorización de acceso y pruebas; no guardar contraseñas del dispositivo en notas comunes ni imprimirlas.

### Avances y calidad

Agregar novedades con autor y hora, conservando el resumen actual. Separar nota interna de descripción apta para el cliente. Adjuntos privados con límite de tamaño, tipos permitidos, permisos y vencimiento de enlaces.

Antes de “Listo para retirar”, checklist breve según tipo de equipo y falla: prueba relacionada con el trabajo, accesorios completos y observaciones finales. No convertirlo en veinte campos obligatorios para todas las órdenes. Una excepción debe identificar al responsable y el motivo.

### Entrega y garantías

Registrar quién retira, fecha, accesorios devueltos, saldo y conformidad. Un saldo pendiente requiere autorización administrativa, no una marca automática de pagado. Emitir constancia de entrega y condiciones aplicables.

Mantener el soporte de garantía existente y vincular los reingresos a la REP original. No cobrar otra vez ni cambiar historial por defecto. Registrar causa, trabajo realizado y costo interno para medir retrabajos. Las condiciones comerciales y legales de garantía deben validarse para el negocio, no inventarse desde el software.

## 7. Plan por cada sección actual

Las mejoras de esta tabla complementan el circuito de taller; no significan que todas deban publicarse juntas.

| Sección | Conservar | Mejorar/agregar | Simplificar o evitar |
| --- | --- | --- | --- |
| **Dashboard** | Rango mensual, cuentas, métricas, reposición plegable. | Bloque de acción: autorizaciones pendientes, repuestos sin gestionar, equipos listos sin retirar, vencidos y cambios recientes. Cada número abre una lista filtrada. | No llenar la primera pantalla de métricas históricas ni mezclar caja con utilidad. |
| **Productos** | SKU, categorías, costos/precios, stock y filtro estable. | Disponibles/reservados, ubicación, búsqueda y paginación de servidor; movimientos de stock trazables. | No retomar el carrusel de categorías que complicó la operación; no cambiar SKU existentes. |
| **Ventas** | Venta rápida, carrito y cobros divididos. | Idempotencia, corrección/devolución auditada, comprador opcional, vínculo claro a recibo/comprobante. | No volver a descontar stock o cobrar al emitir el documento. |
| **Gastos** | Fecha operativa y cuenta de salida. | Adjuntar comprobante, proveedor y vínculo opcional a compra/REP; diferenciar gasto operativo de pago de repuesto. | No cargar el mismo egreso también desde compras. |
| **Visitas** | Cliente, domicilio, fecha/franja y estados. | Técnico asignado, conflicto de horarios, vista día/semana, resultado y conversión a orden sin recargar datos. | No sumar un calendario externo obligatorio en la primera etapa. |
| **Placas de Televisores** | Tipos, precio publicado, neto, liberación prevista y confirmación manual. | Costo de compra/recuperación, ubicación, referencia de venta, devoluciones y conciliación del depósito real. | No llamar ganancia a todo el neto cobrado si falta el costo. Separar liberación estimada por fecha de confirmación efectiva. |
| **Sueldo** | Personas, retiros, objetivos, reservas y distribución ya existentes. | Mostrar efecto de compromisos de compra y costos completos antes de sugerir retiros; cierre mensual trazable. | No presentar caja disponible como ganancia distribuible ni tratar el módulo como liquidación laboral legal completa. |
| **Pedidos** | Reposición mensual de productos. | Nueva bandeja de repuestos de REP, comprador, proveedor, fecha esperada, recepciones y reservas. | Una pantalla con dos vistas, no otro menú desconectado llamado repuestos. |
| **Cuotas** | Calendario, cuotas y movimientos vinculados. | Fin de mes correcto, cobro transaccional, reintentos seguros, vencidos y detalle de deuda; parciales si son necesarios. | No modificar automáticamente vencimientos ya pactados. |
| **Caja** | Tres cuentas reales y saldos base bloqueados. | Arqueo físico vs saldo esperado por cuenta, diferencias justificadas y cierre/reapertura auditados. | No volver a habilitar la caja base ni esconder diferencias cambiando saldos visuales. |
| **Cambio de balance** | Transferencia entre cuentas sin alterar el total. | Nombre visible “Transferencias entre cuentas”, comprobante y motivo. | No presentarlo como edición libre del balance. Conservar ruta/compatibilidad. |
| **Reportes** | Filtros de período y exportaciones. | Tiempos por etapa, presupuestos aceptados, partes demoradas, entregas, retrabajo, deuda y margen con costos conocidos. | No comparar técnicos solo por facturación ni llamar ganancia a ingresos sin costos. |
| **Pagos de reparaciones** | Historial y distribución por medio. | Señas, varios cobros por REP, saldo real y reversas auditadas; cobro independiente de entrega. | Integrar el acceso desde la ficha; evitar dos reparaciones diferentes para un mismo equipo. |
| **Reparaciones** | REP, clientes/equipos, ficha móvil, asistente, avances y garantías. | Aprobación explícita, responsables, tareas, partes, sincronización, historial visible, pruebas y custodia. | No depender de cambiar manualmente un selector para todo el proceso. |
| **Terciarizaciones** | Vínculo con la orden y taller externo. | Responsable, fecha prometida, costo, estado consultado, retorno, control y saldo al tercero. | No crear una segunda orden desconectada ni dar por entregado al cliente porque volvió del tercero. |
| **Facturación** | Datos y documentos internos existentes. | Documentos separados, estados reales, guardado atómico, PDF profesional y eventual integración fiscal. | No marcar todo pagado ni llamar factura fiscal al documento interno. |
| **Configuración** | Restricciones de caja base y parámetros válidos. | Matriz de permisos, plantillas, auditoría consultable, backups completos y diagnóstico del sistema. | No mostrar importaciones o mantenimiento como tareas diarias del técnico. |

### Clientes y comunicación

La ficha del cliente debe reunir equipos, órdenes, presupuestos, cobros autorizados por rol, garantías y contactos del negocio. Reutilizar los campos y enlaces de portal existentes; antes de ampliar la aprobación online, comprobar el contrato real con el portal externo. No crear otro portal duplicado.

En la primera etapa basta con plantillas desde mostrador: presupuesto, falta de respuesta, demora de repuesto y equipo listo. Abrir WhatsApp no demuestra que se envió un mensaje; guardar “Contacto registrado” por el operador, no inventar entrega o lectura. La integración automática con un proveedor se evalúa después con permisos, costos y reintentos controlados.

### Roles y uso compartido

Mantener admin y técnico, con permisos de acciones específicos. Incorporar “Mostrador” cuando haya una persona que deba cobrar/atender pero no acceder a sueldos, ajustes o mantenimiento. No es necesario abrir toda la administración al técnico para que solicite un repuesto.

El control de permisos debe probarse llamando directamente al servidor, no solo viendo qué oculta el menú. La aprobación comercial, la entrega, las devoluciones y las excepciones de precio deben tener permisos separados.

Dejar una cuenta administradora abierta en la PC impide saber quién actuó y concede sus permisos a cualquiera que la use. Proponer sesión de mostrador, bloqueo al ausentarse y elevación para acciones sensibles. No solucionar esto con cierres de sesión inesperados cada pocos minutos.

## 8. Comprobantes y facturación: propuesta concreta

### 8.1 Separar documentos según su finalidad

| Documento | Cuándo se emite | Contenido y efecto |
| --- | --- | --- |
| **Ingreso de equipo** | Recepción. | REP, fecha, cliente, equipo/serie, falla declarada, accesorios, condición y condiciones informadas. No acredita pago. |
| **Presupuesto** | Antes de autorización. | Versión, alcance, detalle, importe, vigencia y condiciones. Aceptación vinculada al documento exacto. |
| **Recibo de seña/cobro** | Al ingresar dinero. | Número, REP/venta, importe, fecha, cuentas, acumulado y saldo. Un recibo por operación real. |
| **Resumen de reparación** | Cuando termina el trabajo. | Diagnóstico comunicable, trabajo realizado, partes y total final, sin notas privadas. |
| **Entrega/garantía** | Al devolver el equipo. | REP, responsable de retiro, accesorios, pruebas, fecha y condiciones de garantía aplicables. |
| **Factura fiscal** | Según el circuito fiscal del negocio. | Documento autorizado por el sistema fiscal correspondiente, sin duplicar cobro ni stock. |

Identificadores y series de documentos deben permanecer independientes del número REP. Reimprimir no crea una operación nueva. Corregir un documento emitido deja trazabilidad, no reemplaza silenciosamente la versión entregada al cliente.

### 8.2 Mejoras visuales y técnicas del PDF

Logo CHETECH, datos del negocio configurados, número visible, jerarquía clara, importes alineados, fecha argentina y pie con aclaraciones correctas. Probar A4 y, si realmente hay impresora térmica, una plantilla separada, no encoger A4.

Paginación según altura real del texto, cabecera de tabla repetida, totales que no se cortan y prueba con 1, 20 y 80 renglones. Incluir separación por medios, seña/saldo y vínculo a REP cuando corresponda. No imprimir costos, márgenes, notas internas o credenciales del dispositivo.

El estado de pago se calcula desde el registro de cobros, no desde el botón de emitir. La operación de crear/editar documento y sus detalles debe terminar completa o no cambiar nada. Para acciones financieras y de stock, usar transacciones e identificadores únicos de operación.

### 8.3 Facturación fiscal argentina

Actualmente el sistema identifica sus comprobantes como internos y no válidos como factura fiscal. No conviene cambiar esa leyenda sin construir y validar una integración fiscal real.

Si hoy facturás por fuera, primero permitir guardar el número/referencia del comprobante externo junto a la operación. Si querés emitir desde CHETECH, definir con el contador condición fiscal, tipos de comprobante, punto de venta y tratamiento de ajustes; después implementar autorización, respuesta, reintentos sin duplicados y conciliación en ambiente de homologación. ARCA publica los [servicios y manuales de factura electrónica](https://www.afip.gob.ar/fe/ayuda/webservice.asp).

El QR fiscal no es el QR interno de una reparación. Debe seguir las reglas oficiales aplicables a la factura electrónica, como explica [ARCA sobre QR](https://www.afip.gob.ar/fe/qr/conceptos-generales.asp). Este plan no determina tus obligaciones tributarias ni reemplaza la validación profesional.

## 9. Qué quitaría, qué conservaría y qué dejaría para después

**Conservaría:** identidad gris CHETECH, REP completa, uso móvil de la ficha, cobros divididos, historial, cuentas actuales, numeración existente, filtros de período, reposición plegable y caja base bloqueada.

**Simplificaría:** navegación agrupada en Taller, Comercial, Finanzas y Administración; acceso al cobro desde la misma REP; acciones técnicas cortas; importaciones solo en administración. No borrar rutas o datos para hacer más corto el menú.

**Quitaría del flujo normal:** campos financieros para técnicos, posibilidad de “aceptar” por accidente desde un estado genérico, cierre que oculta equipos todavía en custodia y la necesidad de escribir el pedido de un repuesto en observaciones. Conservar notas libres para contexto, no como sustituto de tareas.

**No agregaría ahora:** inteligencia artificial para diagnosticar, gamificación de técnicos, chat interno completo, otro rediseño total, notificaciones personales invasivas, un ERP de proveedores enorme o escritura offline automática de caja/stock. Primero deben ser confiables autorización, repuestos y sincronización.

## 10. Diseño de experiencia y rendimiento

**Dirección visual:** mantener la marca gris y reservar color para significado: azul para trabajo/acción, ámbar para espera o bloqueo, verde para autorización/listo y rojo para errores o vencimientos. Cada color acompañado por texto e icono; no depender de distinguir colores.

**Jerarquía:** REP, falla, próxima acción y responsable antes que información secundaria. En mostrador, acciones comerciales; en taller, avanzar trabajo. Formularios por tarea y edición progresiva, no una ficha con todo abierto a la vez.

**Accesibilidad:** objetivos táctiles de aproximadamente 44 px, foco visible, labels reales, errores junto al campo, modales con foco controlado y devolución del foco al cerrar. Teclado completo en mostrador; sin estados comunicados solo por hover.

**Resoluciones:** validar 360, 390, 430, 768, 1024, 1366 y 1920 px. No scroll horizontal de toda la página; tablas con alternativa móvil. Los controles de una REP no deben desaparecer cuando un nombre o estado es largo.

**Rendimiento:** filtros, orden y paginación de servidor; listas resumidas y detalle bajo demanda; índices basados en consultas reales; evitar descargar todo el historial y luego ocultar filas. Métricas agregadas en servidor y actualización dirigida tras cada acción, no recargar todo el sistema.

**Conectividad:** medir desde la PC y al menos dos teléfonos en el lugar de trabajo; distinguir tiempo de red, servidor y render. Probar Wi-Fi del taller y datos móviles. No proponer otra migración de región sin medición y revisión de la configuración actual.

## 11. Plan progresivo de implementación

Los tamaños son orientativos, no un presupuesto ni una fecha prometida: **S** equivale a 1–3 jornadas; **M**, 4–7; **L**, 8–15, incluyendo pruebas del bloque pero no servicios externos ni demoras operativas. No sumar automáticamente: las etapas comparten tareas y requieren validar reglas con el local.

| Etapa | Entregable verificable | Dependencias | Tamaño |
| --- | --- | --- | --- |
| **0. Base segura** | Versión reproducible, respaldo restaurado en entorno aislado, mapa de permisos y mediciones PC/teléfonos. | Ninguna. | M |
| **1. Aprobación y responsables** | Botón de aceptación/rechazo con evidencia, versión y permisos; asignación y pendientes claros. | 0. | M |
| **2. Repuestos y coordinación** | Solicitudes por REP, bandeja en Pedidos, comprador, fecha esperada, avisos y sincronización segura. | 1 y pruebas de concurrencia. | L |
| **3. Taller e inventario conectado** | Recepciones/reservas, ubicación, historial visible, calidad y devolución; visitas/terceros vinculados. | 2; reglas de costos definidas. | L |
| **4. Cobros y documentos** | Señas/saldo separados de retiro, comprobantes transaccionales y PDF; pruebas de cuotas y reversas. | Base 0; integrar con eventos 1–3. | L |
| **5. Reportes y UX general** | Indicadores confiables, pendientes por rol, consultas paginadas y revisión de las 17 secciones. | 2–4 para métricas completas. | M/L |
| **6. Fiscal y automatización externa** | Referencia externa o emisión fiscal validada; portal/aprobación online y mensajería del negocio si se eligen. | Decisiones fiscales/comerciales y 4 estable. | Estimar aparte. |

No esperar al final del proyecto para reducir riesgos de cobros: tras la etapa 0, comprobar inmediatamente el guardado de comprobantes y el vínculo pago/retiro en staging. Si se reproduce una inconsistencia con operaciones habituales, adelantar ese arreglo de la etapa 4 antes de nuevas funciones.

### Primer piloto recomendado

Una PC de mostrador, un técnico y un conjunto pequeño de nuevas órdenes. Durante una semana registrar cada problema y medir cuánto tardan las acciones. Luego extender a los otros técnicos. Las órdenes antiguas siguen consultables y no se convierten masivamente por inferencia.

El primer paquete útil incluye **confirmación del cliente + solicitud de repuesto + bandeja de pendientes + aviso al responsable**. Publicar solamente un botón que cambia un texto no resolvería el problema de organización que planteaste.

## 12. Mapa técnico para ejecutar sin reescribir

Los siguientes nombres de archivos nuevos son una propuesta de organización, no archivos que ya se hayan creado. Mantener los patrones de servidor, validación y pruebas actuales. No dividir grandes componentes ajenos a una etapa solo por refactorizar.

| Bloque | Archivos existentes principales | Nuevas unidades propuestas |
| --- | --- | --- |
| Reglas/aprobación | `src/features/repairs-access/actions.ts`, `schemas.ts`, `queries.ts`, componentes de ficha/mesa de trabajo; `src/lib/permissions.ts`. | `src/features/repairs-access/workflow.ts`, `workflow.test.ts`, `approval-actions.ts`, `approval-actions.test.ts`, `components/repair-approval-dialog.tsx`. |
| Partes vinculadas | `src/features/replenishment/actions.ts`, `queries.ts`, `types.ts`, `components/replenishment-view.tsx`. | `src/features/repair-parts/schemas.ts`, `model.ts`, `model.test.ts`, `actions.ts`, `queries.ts`, `components/part-request-dialog.tsx`, `components/parts-inbox.tsx`. |
| Sincronización/tareas | `src/features/repairs-access/components/repair-access-orders-section.tsx`, `src/hooks/use-persistent-form-draft.ts`. | `src/features/repairs-access/use-order-updates.ts`, `use-order-updates.test.tsx`, `components/order-activity.tsx`, `src/features/work-tasks/queries.ts`, `actions.ts`. |
| Ingreso/entrega | `src/features/repairs-access/components/repair-access-new-order-wizard.tsx`, `repair-access-order-detail.tsx`, `repair-access-workshop-card.tsx`. | `src/features/repairs-access/components/quality-check.tsx`, `delivery-dialog.tsx` y pruebas de acciones de entrega. |
| Dinero/documentos | `src/features/repairs/actions.ts`, `repair-access-sync.ts`; `src/features/invoices/actions.ts`; `src/app/api/invoices/[id]/pdf/route.ts`; `src/features/installments/model.ts`, `actions.ts`. | `src/features/repair-payments/model.ts`, `model.test.ts`; `src/features/invoices/document-model.ts`, `document-model.test.ts`; pruebas de sincronización sin retiro. |
| Consulta y reportes | `src/features/dashboard/queries.ts`, `src/features/reports/queries.ts`, `src/features/repairs-access/queries.ts`, consultas de cada historial. | Pruebas de paginación, permisos y agregados por evento; componentes de indicadores con los patrones existentes. |
| Seguridad/recuperación | `src/app/api/backup/route.ts`, `src/lib/auth.ts`, `src/lib/supabase/middleware.ts`, `src/lib/permissions.ts`. | `docs/operations/backup-restore.md`, `docs/operations/release-checklist.md`, pruebas de recuperación y contratos de permisos. |

Las migraciones futuras llevarán el timestamp real de su implementación, no una fecha ficticia fijada por este plan. Se ubicarán en `supabase/migrations/` y se probarán primero en base aislada.

### Contratos de datos mínimos

| Entidad propuesta o ampliación | Datos y restricciones esenciales |
| --- | --- |
| Orden | Mantener ID/REP; responsable por usuario, ubicación, próxima acción/fecha y versión de concurrencia. Conservar nombre histórico aunque la cuenta deje de existir. |
| Versión de presupuesto | Orden, número de versión único por orden, líneas/alcance, total, moneda, vigencia, autor y fechas. La versión aceptada no se sobrescribe. |
| Decisión del cliente | Presupuesto/version, aceptar/rechazar/revocar, monto de referencia, canal, actor que registra, fecha y evidencia privada opcional. |
| Solicitud de repuesto | Orden, solicitante, descripción/código, cantidad, prioridad, situación, comprador, fecha esperada y vínculo a compra/reserva. |
| Eventos/tareas | Reutilizar historial/auditoría de estado y agregar eventos faltantes; destinatario, leído, resuelto y versión/origen para evitar duplicación. |
| Recepción/reserva/consumo | Relación con compra, producto/parte, orden, cantidad, ubicación y costo histórico. Cantidades reservadas/consumidas nunca superiores a disponibles. |
| Cobro/devolución | Reutilizar movimientos existentes mediante una referencia canónica por operación; monto, cuenta, fecha, orden/venta, actor e idempotencia. No crear un segundo saldo paralelo. |
| Documento | Tipo/serie/número, versión o documento rectificativo, origen, totales y referencia al pago cuando corresponda. No genera otro cobro al reimprimir. |

Todos los importes usarán las reglas monetarias y precisión del sistema; las nuevas operaciones deben evitar acumulación de errores de coma flotante. Separar fecha de negocio de timestamp del evento y mostrar ambos en Argentina cuando corresponda.

### Secuencia de trabajo por bloque

- [ ] Escribir primero una prueba que reproduzca el caso específico de la tabla de aceptación siguiente.
- [ ] Ejecutarla y verificar que falla por la carencia que se va a resolver, no por configuración rota.
- [ ] Agregar la migración aditiva y la regla de dominio mínima, con autorización en servidor y restricciones de datos.
- [ ] Implementar la acción transaccional/idempotente y probar error, doble envío y datos desactualizados.
- [ ] Conectar la UI conservando borradores, labels, errores y comportamiento móvil.
- [ ] Ejecutar pruebas del bloque y la batería general; revisar diferencias de permisos y saldos.
- [ ] Publicar una vista previa contra una base de prueba, probar PC y celulares y obtener aceptación operativa del piloto.
- [ ] Crear un commit delimitado, registrar migración/release y publicar solo el bloque aprobado; no incluir cambios ajenos del directorio de trabajo.

## 13. Pruebas de aceptación obligatorias

| Caso | Resultado que debe poder demostrarse |
| --- | --- |
| Aceptación comercial | Mostrador confirma un presupuesto y el técnico ve importe/versión/actor correctos sin cambiar dinero ni stock. |
| Límite de permisos | Técnico llama directamente a la acción de aceptación/entrega/caja y obtiene denegación sin escritura. |
| Presupuesto modificado | Mostrador intenta aprobar una versión vieja y recibe conflicto; no autoriza la nueva automáticamente. |
| Reintento | Doble clic o respuesta perdida seguida de reintento produce una sola aceptación, tarea, compra o cobro. |
| Repuesto sin comprar | La solicitud persiste tras cerrar sesión y aparece en la bandeja del comprador con la REP correcta. |
| Recepción parcial | Llegan 1 de 2 partes: solo la cantidad recibida se reserva; la necesidad restante sigue pendiente. |
| Competencia por stock | Dos órdenes intentan reservar la última unidad; solo una lo consigue, sin stock negativo. |
| Cancelación | Se conserva compra/historia y se libera únicamente la reserva que corresponde. |
| Dos dispositivos | Guardar en PC actualiza teléfono y viceversa; el aviso respeta los permisos. |
| Dos editores | Un guardado viejo no borra el avance más nuevo; se ofrece revisión del conflicto. |
| Celular sin red | No aparece éxito falso; el borrador se conserva y el reintento no duplica la operación. |
| PWA y sesión | Tras segundo plano y renovación de sesión, se retoma sin perder edición ni entrar en bucle de login. |
| Cobro parcial | Seña de $30.000 en reparación de $100.000 deja saldo $70.000 y no marca el equipo retirado. |
| Cobro dividido | Saldo $70.000 pagado $20.000 efectivo + $50.000 NX Local deja cero; cada cuenta cambia una sola vez. |
| Emisión de documento | Emitir o reimprimir no cambia stock/caja y no convierte una deuda en pagada. |
| Falla intermedia | Un error al guardar líneas revierte la transacción; el documento anterior permanece completo. |
| Devolución de equipo | Rechazado o sin solución sigue visible mientras está en el local; entrega queda con autor y fecha. |
| Garantía | Reingreso vinculado a original conserva la venta y no genera otro cobro por defecto. |
| Fechas | 31/01 genera siguiente vencimiento 28/02 o 29/02 según año; 00:30 UTC no cambia la fecha operativa elegida. |
| PDF | 1, 20 y 80 líneas, textos extensos y varios pagos sin superposición; sin notas privadas. |
| Métricas | Totales por cuenta, pendientes y margen coinciden con un conjunto de operaciones de prueba conocido. |
| Restauración | Base/archivos recuperados en entorno aislado permiten encontrar una REP, sus partes, historial y comprobantes. |

Comandos de verificación existentes para cada entrega, ejecutados por separado:

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
```

Resultado esperado: todos terminan con código 0. Esto no sustituye las pruebas transaccionales contra una base de prueba ni las pruebas de navegación real. El proyecto no tiene un comando E2E declarado en `package.json`; incorporarlo como parte de la etapa 0 antes de prometer una cobertura automática punta a punta.

## 14. Publicación y protección de datos

- [ ] Conciliar versión de GitHub y producción para que cualquier PC pueda reconstruir exactamente el release.
- [ ] Inventariar tablas, funciones, políticas y dependencias compartidas con el portal/tienda; probar que no se alteran sus contratos.
- [ ] Obtener backup restaurable de base y archivos; separar exportación Excel de respaldo técnico.
- [ ] Restaurar en ambiente aislado y usar datos sintéticos o anonimizados en las pruebas y vistas previas.
- [ ] Aplicar migraciones aditivas, manteniendo numeración, IDs y saldos históricos. No inferir retrospectivamente dinero o aprobaciones.
- [ ] Activar nuevas reglas primero en el piloto; revisar órdenes abiertas manualmente cuando falte contexto.
- [ ] Preparar reversión de aplicación compatible con el esquema ampliado. No borrar tablas nuevas si ya contienen operaciones reales.
- [ ] Ante diferencias de caja, pausar la nueva operación afectada y reconciliar eventos; no corregir importes a mano para que coincidan.
- [ ] Registrar errores/latencias sin nombres, teléfonos ni notas privadas; revisar permisos también en archivos y suscripciones.
- [ ] Revalidar dependencias e importaciones de Excel, seguridad de sesiones y límites de carga antes del release; no asumir que la auditoría anterior sigue vigente.

No cambiar de región ni proveedor, reinstalar skills o rediseñar autenticación como requisito de estas mejoras. Las skills ayudan al trabajo de desarrollo; no son funcionalidades que el cliente del taller recibe por instalarlas.

## 15. Indicadores para saber si el cambio sirvió

Medir una semana de referencia y comparar dos semanas del piloto. Las metas se ajustan a volumen y horarios del local, no a cifras genéricas del mercado.

| Indicador | Definición y uso |
| --- | --- |
| Órdenes sin responsable | Abiertas sin técnico/responsable asignado. Meta operativa: ninguna queda sin revisar al cierre del día. |
| Aceptadas sin avanzar | Tiempo desde aceptación hasta siguiente acción real, descontando bloqueos identificados. Muestra fallas de coordinación. |
| Repuestos sin gestionar | Solicitudes abiertas sin comprador/acción; medir antigüedad y vencimiento prometido. Meta: todas con responsable. |
| Espera por etapa | Mediana y percentil 90 del tiempo en diagnóstico, cliente, partes y reparación; no solo antigüedad total. |
| Presupuestos aceptados | Aceptados / decisiones de clientes sobre presupuestos vigentes; pendientes aparte. No mezclar versiones sustituidas. |
| Listos sin retirar | Equipos listos todavía en custodia, con días y último contacto. Rechazados pendientes de devolución en una lista aparte. |
| Retrabajo/garantías | Órdenes de garantía vinculadas / reparaciones entregadas de la cohorte correspondiente. No atribuir culpa automáticamente. |
| Margen de reparación | Importe del trabajo menos partes consumidas, tercero y otros costos directos definidos; no llamarlo utilidad neta del local. Mostrar “costo incompleto” cuando falte información. |
| Cobrado y adeudado | Suma de pagos efectivos y saldo por orden; independiente de emisión de comprobantes y entrega. |
| Calidad del sistema | Guardados fallidos, conflictos detectados, desconexiones, latencia entre dispositivos y operaciones duplicadas. |

## 16. Organización diaria que acompañaría al sistema

**Al abrir:** mostrador revisa clientes por confirmar, partes sin gestionar y entregas comprometidas. Cada técnico revisa sus órdenes habilitadas y pendientes del día.

**Durante el trabajo:** una solicitud se registra desde la REP; una llamada del cliente termina en una decisión registrada; un repuesto recibido se asigna a su orden. No dejar el paso pendiente únicamente en conversación verbal.

**Al cerrar:** revisar órdenes sin próxima acción, equipos físicamente en el local, compras atrasadas y movimientos sin comprobante. No exigir completar todo: exigir que lo pendiente tenga responsable y fecha de revisión.

**Una vez por semana:** revisar demoras, garantías y consultas repetidas; ajustar un cuello de botella antes de sumar nuevas pantallas.

## 17. Decisiones antes de ejecutar

No impiden usar este plan, pero sí deben quedar acordadas al iniciar su etapa:

1. Quién registra aprobaciones y quién puede autorizar compras/excepciones. Propuesta inicial: mostrador/admin, no técnico.
2. Qué consideran presupuesto comunicado y cuánto tiempo antes de volver a consultar al cliente. Propuesta inicial: contacto manual registrado, sin automatizar mensajes.
3. Quién compra y recibe partes. Propuesta inicial: un responsable visible, aunque seas vos para ambas tareas.
4. Si actualmente se emite factura fiscal por ARCA u otro sistema. Propuesta inicial: mejorar internos y vincular factura externa, sin interrumpir el circuito fiscal actual.
5. Qué alcance real tiene el portal de clientes existente. Propuesta inicial: conservarlo y usar aprobación interna registrada antes de ampliar permisos públicos.

**Orden recomendado definitivo:** proteger datos y reproducir problemas; resolver aprobación, repuestos y coordinación; separar cobro de entrega y profesionalizar comprobantes; completar stock/costos/reportes y UX. Mantener cada publicación pequeña, comprobable y reversible.
