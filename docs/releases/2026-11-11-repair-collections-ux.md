# Reparaciones: cobro, retiro y borradores

## Uso diario

- Las tarjetas y la ficha completa ofrecen Cobrar sin salir de Reparaciones. El panel consulta el total, lo abonado y el saldo real antes de habilitar el formulario.
- Se puede registrar una sena o un saldo con varios medios. Agregar un medio deja su importe en cero: nunca supone que se recibio el resto de la deuda.
- Confirmar cobro no entrega el equipo ni inicia una garantia. Registrar entrega es una confirmacion independiente, con destinatario y control de accesorios.
- Los recorridos de entrega verifican el saldo financiero real antes de llamar a la operacion de custodia existente. Una deuda positiva requiere autorizacion expresa y motivo; un indicador historico de pagado no sustituye esa comprobacion. Las funciones SQL existentes no se modifican en esta entrega.
- Si un equipo listo para retirar conserva un indicador historico de no pagado pero su saldo real es cero, se pide confirmar expresamente la entrega sin cobros pendientes y su motivo, conservando la validacion y auditoria de custodia existentes.
- La confirmacion del presupuesto se concentra en Actualizar trabajo. Se conservan las opciones Presupuestado y aceptado/rechazado; elegirlas expresa esa decision al guardar, sin pedir una segunda confirmacion equivalente.
- Cambiar importe o detalle de un presupuesto aceptado lo devuelve a Presupuestado y requiere una nueva autorizacion. Cambiar solo el avance no revoca la aceptacion.

## Borradores y conexion

Los borradores de cobro pertenecen al usuario y al contexto del registro en ese navegador. Recuperar es una accion explicita y nunca envia un cobro. Los formularios advierten al salir con cambios, y el borrador se elimina solo tras confirmar el guardado o descartarlo expresamente.

Si se corta la conexion despues de guardar en el servidor, se conserva el identificador y el contenido del intento original. Reintentar lo mismo recupera el resultado sin registrar otro pago, incluso si el saldo ya bajo o llego a cero. Editar realmente el importe, fecha o medio crea otro intento; agregar una fila sin importe no lo convierte en un nuevo cobro.

El panel avisa si el navegador impide guardar un borrador. El cobro en ficha permite continuar solo con autorizacion explicita, manteniendo el intento en memoria; cerrar esa ventana pierde esa proteccion local y requiere verificar el saldo antes de volver a cobrar.

No se deben usar borradores como comprobantes de pago. El resultado confirmado y el historial del sistema son la referencia financiera.

## Busqueda

La busqueda de Pagos de reparaciones consulta todo el historial antes de paginar. Incluye datos del cliente, contacto, equipo y orden vinculada, sin descargar todos los registros al navegador. Los enlaces de seleccion y correccion conservan el registro exacto aunque no este en la pagina visible.

Las consultas manuales de REP descartan respuestas anteriores si se cambia de orden, edita el formulario, reinicia o sale de la pantalla.

## Verificacion Y Limites

Verificacion local final: 1703 pruebas aprobadas, 80 integraciones omitidas por requerir su entorno especifico; lint, TypeScript y build de produccion aprobados. Dos revisiones independientes cerraron los problemas importantes de concurrencia, recuperacion y entrega encontrados antes de publicar.

Las pruebas se realizan sobre una base local descartable, reconstruida solo con el esquema y datos ficticios. Se cubren ingreso, presupuesto, garantia, aceptacion, pruebas, cobros parciales/completos, retiro, PDF, QR privado y busqueda fuera de la primera pagina. Se simula una respuesta perdida despues de un pago confirmado en PostgreSQL y se verifica que recuperar/reintentar no duplique pagos ni movimientos de caja.

La base descartable, su volumen, redes y procesos se eliminaron tras las pruebas. No se crean ordenes de prueba en produccion, no se reinician secuencias, no hay migraciones ni cambios de saldos historicos. Los botones de WhatsApp siguen siendo manuales; las pruebas no envian mensajes. La impresora, la camara y la PWA deben seguir comprobandose con los dispositivos fisicos del local.
