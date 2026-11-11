# QR interno de reparaciones

## Como se usa

El personal inicia sesion en CHETECH en el navegador del celular que abrira el QR. Al escanear una etiqueta, el servidor verifica la identidad, la cuenta activa del local y el acceso a la orden. Si todo es valido, abre esa misma orden y conserva la REP, sus cobros, accesorios e historial de garantia.

Sin sesion, con cuenta de cliente, cuenta inactiva, enlace invalido, orden no accesible o fallo de validacion, se muestra solo el logo CHETECH. Esa respuesta no contiene ficha, nombres, telefonos, importes, numero REP, formularios, scripts ni enlaces al panel o al inicio de sesion. No informa si una orden existe.

Si el tecnico ve solo el logo, debe abrir el sistema e iniciar sesion en ese mismo navegador, y volver a escanear. Una sesion de la PWA puede no compartirse con Safari o con el navegador elegido por la camara; se debe comprobar con los celulares reales del local.

## Compatibilidad y limites

Las nuevas etiquetas de equipo, accesorio y garantia usan `/q/id`. El QR no lleva una contrasena ni datos personales: identifica la orden y no concede acceso por si mismo.

Los enlaces completos de etiquetas anteriores (`view=detalle&order=UUID`) pasan por la misma entrada cuando se abren como documento. Las navegaciones internas, los guardados y los enlaces con mensajes o filtros conservan su circuito. La ficha privada vuelve a comprobar los permisos; las APIs y la seguridad de la base siguen vigentes.

No se cambia el inicio de sesion general, su mecanismo de renovacion, la numeracion ni los comprobantes que el cliente recibe por WhatsApp. No hay migraciones ni escrituras de ordenes por escanear o imprimir.

Un dispositivo con la cuenta administrativa abierta ya esta autorizado. Quien lo use tendra ese acceso, sea tecnico o cliente. Se debe bloquear la PC y los celulares del local cuando no los utiliza el personal. El QR no puede identificar a la persona que sostiene un equipo con una sesion compartida.

## Verificacion

- Identidad confirmada con Auth, no con datos editables del usuario ni con la mera presencia de una cookie.
- Perfil activo del local y lectura autorizada de la orden antes del redireccionamiento fijo. No se acepta un destino externo ni un parametro `next`.
- Respuestas dinamicas, privadas y sin cache, con politica de contenido restrictiva, sin indexacion ni envio de referencia a otros destinos.
- Pruebas de cuentas anonimas/inactivas/clientes, cookies no verificadas, errores, identificadores invalidos, RSC y guardados con Server Actions y formularios nativos.
- Revision independiente, pruebas completas, tipos, lint y compilacion de produccion. Navegador aislado con enlaces nuevos/anteriores y anchos de escritorio y celular; sin ordenes de prueba en produccion.

La prueba fisica de camara, PWA e impresora se realiza en el local. Ninguna prueba responsive sustituye esa comprobacion.
