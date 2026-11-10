# Etiquetas privadas de taller: 80 x 50 mm

## Uso

- Al guardar una nueva orden, `Imprimir etiqueta` aparece junto a la confirmacion de ingreso.
- En la cabecera de la ficha, `Reimprimir etiqueta` abre el mismo circuito.
- La nueva ventana prepara el PDF privado e intenta abrir su dialogo de impresion. Si el navegador no permite imprimir el visor integrado, usar `Abrir PDF`.
- Configurar el controlador con papel de 80 x 50 mm, escala 100%, sin ajustar a pagina. Validar orientacion y margenes con la impresora real.

La etiqueta contiene el numero REP guardado, logo original, cliente/equipo compactos, falla de ingreso destacada, accesorios, fecha y QR interno. Los campos extensos muestran `... Ver ficha`; el original permanece completo en la orden. No se imprimen telefono, domicilio, presupuesto, pagos ni observaciones internas.

## Seguridad e invariantes

La pagina de impresion y el PDF requieren `repairs.view`. El PDF se consulta mediante `workshop_order_payload` con la sesion del usuario, sin service role. Cache privada desactivada. El QR apunta al dominio configurado en `NEXT_PUBLIC_APP_URL`, o al dominio actual de CHETECH por defecto, y abre `view=detalle&order=<uuid>`. La ficha sigue protegida: una foto de la etiqueta no concede acceso. Si la sesion caduco, iniciar sesion y volver a abrir/escanear la etiqueta.

Imprimir, cancelar y reimprimir solo leen la orden: no invocan alta, secuencia, presupuesto, stock, pagos ni auditorias de escritura. No se agregaron migraciones ni se cambiaron las acciones de ingreso o la numeracion. El fallo de una impresora no revierte la orden guardada. Una solicitud al dialogo no acredita salida fisica.

Conservar el dominio anterior o una redireccion si se cambia de dominio despues de imprimir etiquetas. El PDF incorpora fuentes y logo vectorial; sus archivos se incluyen en el despliegue.

## Verificacion

Pruebas de acceso denegado, UUID invalido, orden ausente, errores de DB/render, respuestas HTML por sesion vencida, URL de QR configurada y lectura sin mutaciones. Pruebas del boton tras alta, enlace de reimpresion, carga/cancelacion de blob, temporizadores, error de visor y carrera entre impresion manual y automatica.

El PDF se verifica como una sola pagina exacta de 80 x 50 mm, con campos medidos, truncado explicito, logo original, fuentes embebidas, margen QR de cuatro modulos y muestras ficticias de campos cortos/largos. La comprobacion fisica del adhesivo, calibracion de rollo y lectura en los celulares del local sigue pendiente de disponer de la impresora.
