# Comprobantes automáticos de CHETECH por WhatsApp

## Estado y funcionamiento

El código prepara el ingreso al crear una orden y el documento de pago y garantía al registrar el primer retiro de la orden original. La ficha muestra los estados reales del envío en Documentos y cobros. Los reingresos por garantía no vuelven a emitir el comprobante original.

La integración queda inicialmente pausada. El local actualmente usa WhatsApp Business en el celular y WhatsApp Web y todavía no tiene Meta Business. Hace falta completar esa vinculación antes de habilitar envíos reales. Crear el código o subirlo a Vercel no conecta por sí solo el número a Meta.

## Pasos del propietario

1. Crear el portafolio empresarial de CHETECH en Meta Business con una cuenta de Facebook del propietario.
2. Vincular el número comercial **3571 544683** a WhatsApp Business Platform. Como ese número ya se usa en la aplicación, elegir un proceso de incorporación de **coexistencia** compatible y confirmar su disponibilidad con Meta o un proveedor oficial. Conservar el uso de la aplicación y los chats durante esa incorporación.
3. Habilitar la aplicación de Meta para WhatsApp, obtener el ID de la cuenta de WhatsApp Business, el ID del número y un token de usuario del sistema con permiso `whatsapp_business_messaging`. La lectura de plantillas también necesita `whatsapp_business_management`.
4. Crear y aprobar las dos plantillas de utilidad descritas abajo, con encabezado DOCUMENTO y un PDF de ejemplo ficticio. Meta determina la aprobación y puede cobrar los mensajes enviados mediante la plataforma según su tarifa vigente.
5. Configurar las credenciales en el entorno **production** de Vercel. No enviarlas por chat, guardarlas en Git ni ponerlas en variables `NEXT_PUBLIC_`.
6. Configurar y verificar el webhook `https://chetech-admin.vercel.app/api/whatsapp/webhook`, usando el token de verificación del servidor. Suscribir el evento **messages** de la cuenta comercial a la aplicación.
7. En Configuración, comprobar número, plantillas y confirmaciones de entrega. Activar los envíos cuando los tres controles estén confirmados. La activación configura el trabajador periódico con Supabase Cron y guarda su credencial en Vault.
8. Crear una orden ficticia dirigida a un teléfono controlado por el propietario, registrar su autorización y comprobar ingreso, retiro y ambos PDF. Luego habilitar el uso cotidiano. No usar clientes reales para pruebas.

## Plantillas para registrar en Meta

Idioma de ambas: `es_AR`. Categoría: `UTILITY`. Encabezado: `DOCUMENT`. Parámetros del cuerpo: `{{1}}` nombre del cliente; `{{2}}` número REP. Son parámetros posicionales, en ese orden.

### chetech_ingreso_equipo

Hola {{1}}, recibimos tu equipo en CHETECH. Adjuntamos el comprobante de ingreso de la orden {{2}}. Conservá este documento para consultar el trabajo y retirar el equipo. Consultas: 3571 544683.

### chetech_pago_garantia

Hola {{1}}, registramos el retiro del equipo de la orden {{2}} en CHETECH. Adjuntamos el comprobante de pago y garantía con los pagos y la cobertura registrados. Consultas: 3571 544683.

Las muestras del cuerpo pueden ser `Cliente de ejemplo` y `REP-000357`. Usar un PDF ficticio como muestra del encabezado. La aplicación adjunta el PDF real mediante un ID de medio de Meta; no publica un enlace abierto a los datos de la orden.

## Variables del servidor

| Variable | Uso |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Trabajador de servidor y estados protegidos |
| `WHATSAPP_ACCESS_TOKEN` | Token de la cuenta comercial |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número 3571 544683 |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID de la cuenta WABA |
| `WHATSAPP_GRAPH_VERSION` | Versión vigente y habilitada de Graph API, con formato `vNN.N` |
| `WHATSAPP_APP_SECRET` | Validación de la firma de Meta |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Valor aleatorio de al menos 32 caracteres para verificar el webhook |
| `WHATSAPP_WORKER_SECRET` | Valor aleatorio independiente de al menos 32 caracteres para el trabajador |
| `WHATSAPP_TEMPLATE_LANGUAGE` | `es_AR` |
| `WHATSAPP_INTAKE_TEMPLATE` | `chetech_ingreso_equipo` |
| `WHATSAPP_DELIVERY_TEMPLATE` | `chetech_pago_garantia` |

Las previews de Vercel no envían mensajes. El trabajador no se ejecuta sin configuración completa. La activación no envía masivamente documentos históricos. Pausar cancela los documentos pendientes; no vuelve a enviar mensajes ya aceptados.

## Operación

- Registrar la autorización del cliente en la casilla del ingreso. Cambiar el teléfono o seleccionar otro cliente desmarca esa autorización. La base conserva el número para el que se registró el permiso.
- El guardado de la reparación no espera una respuesta de Meta. El aviso se conserva en una cola transaccional y se prepara después.
- `Aceptado por WhatsApp` indica recepción por Meta. `Entregado` y `Leído` provienen de webhooks firmados. No son equivalentes.
- Los fallos previos al envío y rechazos por límite de frecuencia tienen reintentos acotados. Un envío de resultado desconocido se conserva como pendiente de confirmación para evitar duplicar documentos.
- Para corregir un teléfono inválido, editar el ingreso y registrar la autorización del cliente para ese número. Luego usar Revisar datos y reintentar. Esta recuperación queda auditada y solo está disponible si el documento nunca fue presentado a WhatsApp.
- Si el cliente responde `BAJA`, `STOP` o `NO QUIERO RECIBIR COMPROBANTES`, se cancelan sus siguientes envíos pendientes.
- Los PDF usan una captura de los datos del evento: presupuesto textual, montos de los libros de cobro sin pagos espejo, fecha efectiva de retiro y garantía original. Descargar o enviar un PDF no registra un cobro.
- Las instantáneas privadas y Vault se incluyen en un respaldo técnico de PostgreSQL, no en la exportación parcial de registros públicos.

## Verificación técnica local

`npx vitest run src/features/whatsapp/automation.test.ts src/features/whatsapp/webhook.test.ts`

`npx tsx scripts/staging/whatsapp-documents.ts`

El segundo comando se limita a PostgreSQL local preparado por el proyecto y revierte las fichas ficticias al terminar. No hace peticiones a Meta.

Verificación del 21/10/2026: 1132 pruebas unitarias aprobadas, 69 pruebas opcionales de otros módulos omitidas; comprobación de tipos, lint y compilación de producción correctos. El ensayo transaccional local verificó permisos, duplicados, consentimiento, recuperación, estados inciertos, reactivación y generación de ambos PDF. La comprobación HTTP autenticada verificó configuración, estados, PDF privados y protección de endpoints. La migración de producción quedó aplicada con la automatización desactivada, cero envíos y cero tareas programadas; los hashes de órdenes, pagos, caja y ajustes no cambiaron. No se enviaron mensajes reales: falta la conexión comercial con Meta y una prueba de extremo a extremo con un número controlado por el propietario.

## Fuentes oficiales

- https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media
- https://whatsappbusiness.com/policy/
- https://supabase.com/docs/guides/database/webhooks
- https://supabase.com/docs/guides/functions/schedule-functions
