# ARCA WSAA / WSFEv1: emision manual de Factura C

## Alcance y estado

El CUIT del emisor se configura exclusivamente mediante `ARCA_ISSUER_CUIT` en el servidor, sin identidad personal por defecto en el repositorio publico. Se valida su digito verificador y su correspondencia con el certificado. Esta integracion esta limitada a un emisor Responsable Monotributo habilitado para Factura C, codigo **11**, moneda PES, sin IVA discriminado ni otros tributos; no determina el regimen o categoria fiscal del titular.

La emision se inicia solamente desde una venta o reparacion seleccionada y su comprobante interno guardado. La REP nativa usa `sourceType=repair_access` y conserva `repairAccessOrderId`, sin exigir una reparacion auxiliar; se emite como servicio (concepto 2), con periodo y vencimiento explicitamente confirmados. Crear una factura interna, cobrar, entregar una reparacion o abrir una pantalla **no emite** ante ARCA. Documentos pagados, parciales y pendientes pueden emitirse; los anulados, manuales sin origen vinculado o previamente fiscalizados no.

**Produccion: PV00001 fue constatado como "Factura en Linea - Monotributo", no Web Services, y permanece bloqueado para esta instalacion.** En homologacion, PV00001 puede admitirse si se configura expresamente con `ARCA_HOMO_POINT_OF_SALE=1`, se confirma `ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED=true` y la consulta remota valida su habilitacion WS/CAE. Nunca se asigna ningun PV automaticamente ni se copia un PV entre entornos. Sin certificado, clave y demas configuracion validada, la interfaz muestra requisitos pendientes, nunca una autorizacion ficticia.

No se solicita, lee, almacena ni transmite Clave Fiscal. El titular gestiona certificados y relaciones de servicios en ARCA por fuera de esta aplicacion. El backend usa exclusivamente un certificado X.509 y su clave RSA para firmar CMS/PKCS#7 del TRA WSAA para `wsfe`.

## Preparacion externa

1. En homologacion, obtener el certificado mediante WSASS y asociarlo a `wsfe`. En produccion, obtenerlo mediante Administracion de Certificados Digitales y asociar/autorizar `wsfe` en el Administrador de Relaciones.
2. Configurar un PV Web Services con modalidad CAE; en produccion debe ser diferente de 00001 para esta instalacion. En homologacion puede ser 00001 solo si esta explicitamente habilitado para WS/CAE. No reutilizar un PV de Comprobantes en Linea, controlador fiscal o CAEA.
3. Guardar certificado y clave privada PEM en archivos externos al repositorio, separados por entorno, accesibles solo al usuario del proceso servidor, o como variables privadas del servidor en Vercel. Clave RSA minimo 2048 bits. Esta implementacion estricta requiere el CUIT emisor en `subject.serialNumber`; certificados de representantes con otro CUIT no se admiten.
4. Completar razon social legal, domicilio fiscal/comercial, identificacion de Ingresos Brutos (o condicion de exencion) y fecha real de inicio de actividades. No inventar estos datos.
5. Revisar con el responsable fiscal el concepto, la condicion IVA y el documento/domicilio del receptor de cada emision. Categoria de Monotributo y limites del regimen no se verifican ni calculan automaticamente.

## Variables privadas del servidor

No usar prefijo `NEXT_PUBLIC_` para ninguna variable ARCA, certificado, clave o credencial de servicio. No registrar ni versionar datos personales del emisor, archivos PEM, tokens, firmas, cuerpos SOAP o variables privadas. El despliegue usa configuracion local privada ignorada por Git o variables del servidor; los ejemplos publicados contienen solo placeholders. El CUIT configurado se devuelve al panel unicamente tras autenticar y verificar permisos de administrador.

```dotenv
ARCA_ENVIRONMENT=homologation
ARCA_PRODUCTION_ENABLED=false
ARCA_ISSUER_CUIT=<CUIT-valida-del-emisor-solo-en-servidor>
ARCA_HOMO_POINT_OF_SALE=<PV-Web-Services-de-homologacion-explicito>
ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED=true
# Vercel: PEM como variables privadas, multilinea o con \\n escapados:
ARCA_HOMO_CERTIFICATE_PEM=<contenido-PEM-certificado-homologacion>
ARCA_HOMO_PRIVATE_KEY_PEM=<contenido-PEM-clave-homologacion>
# Clave aleatoria de 32 bytes, base64 canonico, compartida por todas las instancias:
ARCA_TICKET_ENCRYPTION_KEY=<clave-AES256GCM-base64-solo-en-servidor>
# Alternativa local, si no se suministra el PEM correspondiente:
# ARCA_HOMO_CERTIFICATE_PATH=<ruta-absoluta-certificado-homologacion.pem>
# ARCA_HOMO_PRIVATE_KEY_PATH=<ruta-absoluta-clave-homologacion.pem>

ARCA_ISSUER_NAME=<razon-social-legal>
ARCA_ISSUER_ADDRESS=<domicilio-fiscal-comercial>
ARCA_ISSUER_GROSS_INCOME=<identificacion-o-condicion-real>
ARCA_ISSUER_ACTIVITY_START=<AAAA-MM-DD>

# Credencial Supabase exclusivamente server-side, nunca una Clave Fiscal:
SUPABASE_SERVICE_ROLE_KEY=<credencial-servicio-del-servidor>
```

Homologacion es el valor por defecto. Un entorno mal escrito bloquea la configuracion. Produccion exige, adicionalmente, **ambas** variables `ARCA_ENVIRONMENT=production` y `ARCA_PRODUCTION_ENABLED=true`, y las variables separadas `ARCA_PROD_POINT_OF_SALE`, `ARCA_PROD_WS_POINT_OF_SALE_VERIFIED`, `ARCA_PROD_CERTIFICATE_PEM`, `ARCA_PROD_PRIVATE_KEY_PEM` (o sus alternativas `*_PATH`). PEM tiene precedencia sobre archivo; nunca se mezcla material entre entornos. No incluir PEM en settings cliente ni en respuestas API.

La consulta externa encontro que Administracion de Certificados Digitales aun no esta agregada. Agregar servicios, relacionar certificados, crear PV o habilitar produccion requiere confirmacion del titular en ARCA; no se realiza desde estos endpoints ni durante esta implementacion.

Antes de autorizar, el backend valida vigencia y correspondencia cert/clave/CUIT; WSAA autentica el certificado ante ARCA. Luego consulta `FEParamGetPtosVenta` y exige PV CAE activo, no bloqueado ni dado de baja; consulta tipos de comprobante, condiciones IVA clase C y disponibilidad de la referencia opcional 23. El indicador local "configuracion validada" **no reemplaza** esas verificaciones remotas.

Endpoints oficiales fijos, sin URLs configurables por usuario:

| Entorno | WSAA | WSFEv1 |
| --- | --- | --- |
| Homologacion | `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx` |
| Produccion | `https://wsaa.afip.gov.ar/ws/services/LoginCms` | `https://servicios1.afip.gov.ar/wsfev1/service.asmx` |

El cliente CMS firma con RSA/SHA-256. Todas las instancias consultan un cache **compartido y cifrado** en `private.wsaa_ticket_cache`, por entorno/CUIT/huella SHA-256 del certificado DER/servicio `wsfe`. Token y firma solo existen en memoria del servidor para el uso inmediato; PostgreSQL recibe exclusivamente un sobre versionado AES-256-GCM con nonce aleatorio y tag de autenticacion. La clave y el vencimiento forman parte de los datos autenticados: un ciphertext no puede trasladarse entre homologacion, produccion, otro certificado o fecha de expiracion.

`ARCA_TICKET_ENCRYPTION_KEY` debe contener exactamente 32 bytes aleatorios en base64 canonico, sin prefijo `base64:`, espacios o valor por defecto. Generarla con un gestor de secretos aprobado y suministrar el mismo valor privado a todas las instancias del mismo despliegue, nunca al cliente ni a Git. Readiness la exige una vez completos los demas campos de configuracion, y nunca devuelve su valor. La rotacion exige conservar la clave anterior hasta que caduquen los tickets vigentes, o re-cifrar esos registros durante una ventana de mantenimiento autorizada; no cambiarla unilateralmente ni borrar tickets vigentes.

Un RPC transaccional concede una lease de 60 segundos a un solo worker. Otros workers esperan de forma acotada y reutilizan el ticket persistido, sin enviar otro CMS. Un UUID de fencing impide que un worker reemplazado publique; la publicacion es idempotente y se reintenta con el **mismo ciphertext**, no con otra autenticacion. Una respuesta de publicacion perdida se recupera leyendo el cache. No se usa ningun ticket mientras no este persistido. Entradas alteradas, prefijos desconocidos, clave incorrecta y fallos de base bloquean la emision, sin fallback local ni credenciales vacias. La consulta exige mas de dos minutos de vigencia; durante el margen final de un TA aun vigente espera/rechaza temporalmente, no pide otro TA prematuramente.

Limite externo inevitable: si WSAA autoriza un TA pero su respuesta se pierde antes de recibirlo/persistirlo, o el proceso termina en ese intervalo, no hay una operacion WSAA para recuperar ese secreto. Un posterior `coe.alreadyAuthenticated` detiene la emision; requiere esperar el vencimiento del TA y resolver la conectividad, no solicitudes repetidas ni autorizacion ficticia. No hay atomicidad distribuida entre ARCA y PostgreSQL. Esto no consume numeros fiscales ni modifica caja/stock. Sincronizar el reloj del servidor y completar una prueba real de homologacion antes de considerar el despliegue listo.

## Base de datos e integracion

La migracion CLI creada `supabase/migrations/20261005194707_fiscal_issuance_records.sql` crea registros, reservas de serie, RLS, RPC protegidos y guardas de inmutabilidad. Aplicar en desarrollo/homologacion y verificar antes del despliegue. **Este trabajo no ejecuta SQL en produccion ni emite comprobantes reales.** Compatible con las columnas fiscales y de versionado de la migracion financiera posterior. No agrega permisos al rol tecnico.

La nueva migracion CLI `supabase/migrations/20261005212551_wsaa_encrypted_ticket_cache.sql`, posterior a la financiera, crea el cache en el esquema privado con RLS y sin privilegios para `anon`/`authenticated`. Los RPC publicos `wsaa_ticket_claim`, `wsaa_ticket_publish` y `wsaa_ticket_release` son `security invoker`, con `search_path` vacio y permiso exclusivo `service_role`; sus funciones privadas tambien estan restringidas. Aplicar ambas migraciones en orden. Nunca habilitar el esquema `private` en la API de datos. Las llamadas del servidor al cache tienen timeout de ocho segundos y errores sanitizados.

Las mutaciones fiscales solo pueden ejecutarse con `service_role`; el API verifica `auth.getUser()` y el rol persistido con `invoices.manage` antes de usar esa credencial. No confia en `user_metadata` ni en `getSession()`. POST exige JSON del mismo origen, confirmacion explicita y un cuerpo acotado. Las respuestas no incluyen certificado, clave, tokens, firmas ni XML remoto.

Export publico de UI:

```tsx
import { FiscalInvoicePanel } from "@/features/fiscal";

// Detalle del comprobante interno seleccionado:
<FiscalInvoicePanel invoiceId={invoice.id} />

// Configuracion: requisitos y estado, sin boton de emision:
<FiscalInvoicePanel />
```

Propiedades opcionales: `className` y `onIssued(record)` en componentes cliente. Los tipos `FiscalRecord`, `FiscalSnapshot`, `FiscalInput`, `FiscalAuthorization`, `FiscalReadiness` tambien se exportan. El padre integra este componente; este cambio no modifica pantallas, permisos ni logica existente de facturacion.

API Node.js, acceso administrador, `Cache-Control: private, no-store`:

| Ruta | Accion |
| --- | --- |
| GET `/api/fiscal/readiness` | Estado local, sin trafico ARCA |
| GET `/api/fiscal/invoices/:id` | Estado y registros del comprobante |
| POST `/api/fiscal/invoices/:id/preview` | Snapshot servidor; no autoriza ni reserva |
| POST `/api/fiscal/invoices/:id/confirm` | Reclamar, consultar y autorizar manualmente |
| GET `/api/fiscal/records/:id/pdf` | PDF de snapshot aceptado |
| GET `/api/fiscal/records/:id/qr` | PNG QR de snapshot aceptado |

## Fechas, importes y recuperacion

La fecha se obtiene en `America/Argentina/Buenos_Aires`. Nuevas emisiones usan la fecha de hoy; no se admite retrofechado. Concepto 1 productos, 2 servicios, 3 mixto: eleccion explicita, sin inferirla del pago. Servicios/mixto requieren inicio, fin y vencimiento de pago. Condicion IVA obligatoria, validada contra tabla ARCA clase C. Se requiere CUIT valido o DNI de consumidor final para **todos** los montos; no se implementa receptor anonimo ni se fija un umbral monetario que pueda quedar desactualizado.

Importes e items se toman exclusivamente del documento guardado y se revalidan transaccionalmente contra la base. Se conservan subtotal, descuento y total en centavos. Para C sin otros tributos, `ImpNeto=ImpTotal=total luego del descuento`, y los restantes importes son cero; no se envia el array IVA. El redondeo decimal auxiliar usa half-even; los totales ya persistidos no se recalculan a partir del cobro ni se redondean de nuevo.

La serie se serializa por **entorno/CUIT/PV/tipo** con una reserva persistente, no un mutex del proceso. El numero se obtiene de `FECompUltimoAutorizado`, se guarda antes del envio y se consulta siempre mediante `FECompConsultar` antes de autorizar. La referencia opcional 23 contiene el UUID del registro para distinguir otra factura con el mismo importe/receptor.

Una respuesta perdida o inconsistente conserva el numero y bloquea toda la serie. Una lease de dos minutos impide recuperar mientras otro worker esta enviando; no libera la serie ni descarta la solicitud. "Consultar y recuperar" utiliza el mismo UUID, snapshot y numero. Solo se reenvia ese mismo numero cuando ARCA informa ausencia (602) y el ultimo autorizado es exactamente el numero anterior. Nunca se salta a un nuevo numero ante incertidumbre. Incluso un rechazo se vuelve a consultar para detectar una autorizacion anterior cuya respuesta se perdio. Si un sistema externo consume el numero, el detalle no coincide o falta la referencia, se requiere conciliacion manual: no hay boton para forzar una liberacion.

Reservas activas impiden editar encabezado/items. Un registro aceptado no puede actualizarse ni eliminarse. En produccion se vincula el numero fiscal y se bloquea el contenido del documento interno. En homologacion no se marca el interno como fiscalizado en produccion; el registro de prueba permanece inmutable. Los cobros siguen su circuito independiente. No se altera caja, pagos ni stock.

Solo un CAE aceptado y persistido habilita PDF/QR. Los PDFs de homologacion llevan marca visible **SIN VALIDEZ FISCAL**. No existen CAE simulados en runtime ni PDF fiscal de una vista previa. Notas de credito/debito, anulacion, CAEA, otros tributos, monedas extranjeras y otros tipos quedan fuera de alcance.

## Verificacion sin secretos

```powershell
npm test -- src/features/fiscal
npm run typecheck

# Exclusivamente un PostgreSQL Docker descartable con este nombre exacto:
docker run --name chetech-fiscal-test --env POSTGRES_HOST_AUTH_METHOD=trust --detach postgres:17-alpine
$env:CHETECH_FISCAL_TEST_CONTAINER='chetech-fiscal-test'
npm test -- src/features/fiscal/database.test.ts
```

Los tests SQL reinicializan esquemas **solo** dentro de `chetech-fiscal-test`. No usar un contenedor compartido, staging o produccion. Las pruebas WSAA generan certificados sinteticos en memoria; los tests WSFE usan transporte inyectado, sin solicitudes ARCA. Es necesaria una prueba end-to-end posterior en homologacion con certificados y PV realmente habilitados; no se realizaron llamadas fiscales reales durante esta implementacion.

El cache se prueba con dos coordinadores independientes, transacciones PostgreSQL concurrentes, aislamiento homo/prod del mismo emisor, leases reemplazadas, reintento despues de un ticket invalido, respuesta de publicacion perdida, prefijos invalidos, tags alterados y vencimientos. Se comprueba que ninguna fila contiene token/firma en texto plano y que los roles del navegador no pueden consultar tablas ni ejecutar RPC.

## Fuentes oficiales revisadas el 2026-10-05

- [Manual vigente WSFEv1, version 4.6, CAE, errores, consultas, opcion 23 y condicion IVA](https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf).
- [WSAA: certificado y endpoints](https://www.arca.gob.ar/ws/documentacion/wsaa.asp).
- [Manual del desarrollador WSAA: TRA y CMS](https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf).
- [Especificacion WSAA 1.2.2: tickets vigentes y coe.alreadyAuthenticated](https://www.afip.gov.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf).
- [Especificaciones QR: payload base64 y URL ARCA](https://www.afip.gov.ar/fe/qr/documentos/QRespecificaciones.pdf).
- [Supabase: funciones y seguridad de privilegios](https://supabase.com/docs/guides/database/functions).

Los manuales contienen reglas generales y variantes no implementadas; ante una respuesta inesperada esta integracion conserva la reserva y falla cerrada, en lugar de asumir una autorizacion.
