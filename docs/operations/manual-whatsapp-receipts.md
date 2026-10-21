# Enviar comprobantes desde WhatsApp Web

## Uso diario

1. Mantener iniciada en WhatsApp Web la cuenta comercial del local, 3571 544683. CHETECH no puede comprobar ni elegir qué cuenta está abierta en WhatsApp.
2. Al guardar una orden nueva, usar Enviar comprobante de ingreso en la confirmación o en la ficha. El botón también está visible en las tarjetas de órdenes.
3. Al registrar el retiro real del equipo, aparece Enviar pago y garantía. El estado Retirado sin una fecha real de retiro no habilita ese documento.
4. El botón prepara el PDF y abre una nueva pestaña de WhatsApp Web con el teléfono principal del cliente y el mensaje. Revisar el destinatario y pulsar Enviar en WhatsApp.
5. El cliente recibe un enlace protegido. Puede abrir y descargar ese PDF sin tener una cuenta de CHETECH. No necesita ingresar al panel administrativo.

Este flujo no utiliza la API paga, no requiere Meta Business ni envía mensajes en segundo plano. El sistema no puede saber si un mensaje manual fue enviado, entregado o leído. No debe interpretarse crear un enlace como una confirmación de envío.

## Seguridad Y Correcciones

- El enlace permite ver un único comprobante. Quien reciba un reenvío del enlace también puede acceder a ese documento: no es una autenticación de identidad del cliente.
- Vence a los 365 días. No es de un solo uso: las previsualizaciones de WhatsApp no lo consumen.
- En Enlaces compartidos se pueden cancelar, con confirmación, todos los enlaces anteriores del ingreso o todos los de pago y garantía por separado.
- Repetir el botón crea otra copia con los datos actuales y no invalida un enlace ya enviado. Si hubo un error o se corrigió un pago, cancelar primero los enlaces anteriores del documento correspondiente y luego generar y enviar uno nuevo.
- Cada copia conserva los datos y fechas al prepararla. Los cambios posteriores de presupuesto, cobros o garantía no modifican silenciosamente esa copia.
- Solo se conservan los datos que muestra el modelo correspondiente: el ingreso no expone importes ni cobros; pago y garantía no expone domicilio, teléfono, falla ni identificadores internos de pagos.
- El servidor solo guarda el hash de un token aleatorio de 256 bits, nunca el enlace completo. No se registran tokens en la auditoría de negocio. Como toda URL compartida, puede aparecer en historiales o registros técnicos de acceso; no difundirla públicamente.
- Los PDF no se indexan y sus respuestas no se almacenan en cachés públicas. Acceder al PDF no cambia la orden ni registra un cobro.
- Las copias privadas de documentos se incluyen en el respaldo técnico de PostgreSQL, no en la exportación parcial de tablas públicas.

## Verificación

Las pruebas locales usan únicamente fichas ficticias y nunca siguen el redireccionamiento hacia WhatsApp. Se prueban permisos, origen, ambos modelos, acceso anónimo limitado al documento, vencimiento, revocación, minimización de datos, inmutabilidad ante cambios reales de presupuesto/cobros y apertura nativa en pestaña nueva.

Comandos: `npx tsx scripts/staging/manual-document-shares.ts --fresh` y `npx tsx scripts/staging/manual-document-shares-http.ts`.

La automatización anterior por API permanece desactivada y opcional. No se contrataron servicios externos ni se agregó un cargo por mensaje al sistema.
