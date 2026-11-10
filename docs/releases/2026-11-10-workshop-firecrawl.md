# CHETECH: circuito de taller y etiquetas

## Donde encontrarlo

- Reparaciones / Ordenes: proximo paso, bloqueos, ubicacion y fecha de revision interna. No se exige elegir un tecnico.
- Reparaciones / Repuestos: solicitudes, compras, recepciones parciales, repuestos disponibles y llegadas vencidas con fecha registrada. Incluye filtro de utilizados para reclamar una pieza ya instalada.
- Reparaciones / Repuestos / Reclamos al proveedor: abrir, informar envio, resolver o cancelar; conserva el historial. Puede vincularse al reingreso activo de la misma REP.
- Reparaciones / Garantias: mantiene las visitas separadas de la orden original. Las tarjetas muestran la falla actual del reingreso y actualizan esa visita, no el presupuesto anterior.
- Reparaciones / Metricas: consulta todo el taller. El rango inicial es el primer dia del mes hasta hoy.
- Ingreso guardado / Imprimir etiqueta, o ficha / Reimprimir etiqueta: elegir Equipo, Accesorio A1-A99 o Reingreso de garantia. Todas usan la misma REP y el QR privado de la orden. La impresion se solicita con el boton, no automaticamente al cambiar de tipo.

## Reglas de seguridad operativa

Los reclamos al proveedor no registran devoluciones, pagos, egresos o ajustes de inventario. Una pieza con reclamo activo no puede usarse o cancelarse hasta resolverlo. El cierre conserva su resolucion. Los gastos reales se registran en Gastos; una compra no se considera automaticamente pagada.

Costo vacio significa sin informar; un cero explicitamente cargado significa cero. Actualizar solamente un estado no borra un costo existente. Versiones y operaciones identificadas protegen de dobles guardados y cambios simultaneos.

Las etiquetas de accesorio usan una descripcion temporal que no modifica la ficha. Si no entra completa, la vista previa advierte el recorte: hay que acortarla. El QR no recupera esa descripcion temporal.

El QR requiere una sesion autorizada del sistema. No publica datos de clientes ni contiene el nombre o telefono dentro del enlace.

## Como interpretar las metricas

Las ordenes originales y los reingresos tienen contadores separados. La antiguedad es tiempo calendario en el local, no horas de trabajo. Las medianas usan intervalos de estados comprobables y muestran la muestra disponible. Ediciones genericas e historiales reconstruidos no inventan tiempos de trabajo.

Los ingresos y retiros del periodo son flujos diferentes: pueden retirarse equipos recibidos en meses anteriores. Los datos sin fecha verificable no se presentan como ceros.

La tasa comparable de reingresos se habilita desde una confirmacion explicita de registro completo, sin retroactividad. Solo compara garantias completamente observadas y vencidas. Las coberturas corregidas con snapshots incompatibles se excluyen, explicando el motivo; sus reingresos no se borran del historial. No hay productividad por persona porque el local usa una cuenta compartida.

## Verificaciones de la entrega

- 1393 pruebas aprobadas y 69 pruebas de otras integraciones omitidas por sus requisitos de entorno; lint, tipos y compilacion de produccion aprobados.
- 11 comprobaciones SQL de metricas en un clon PostgreSQL 17 sin red, con rollback.
- Seis carreras concurrentes reales: altas, actualizaciones y cierre contra alta, en READ COMMITTED y REPEATABLE READ. Un guardado valido y un conflicto controlado por escenario; limpieza comprobada.
- Regresiones SQL de reclamos y busqueda de garantias, incluidos permisos y preservacion de la orden original.
- Revision visual en 1366, 1024, 390 y 360 px, sin desbordes ni errores JavaScript en las cuatro vistas verificadas.
- Etiquetas verificadas con PDFs reales, QR a 203/300 dpi y vistas previas a 390/1366 px. Cero impresiones automaticas, una vista previa por seleccion.
- Migraciones aplicadas en produccion: los hashes y cantidades de 19 conjuntos de registros existentes permanecieron iguales antes y despues. Sin ordenes de prueba ni cambios financieros en produccion.

## Pendiente Fuera Del Software

La compra de la impresora, configurar el rollo de 80 x 50 mm, calibrar el sensor, comprobar adhesivo y hacer pruebas fisicas con los celulares del taller requieren el equipo real. Imprimir al 100%, sin ajustar a pagina. La simulacion responsive no reemplaza una prueba fisica de iPhone/PWA o de la impresora.

Se recomienda un piloto de cinco dias: revisar lectura del QR, legibilidad de fallas, accesorios devueltos, recepciones parciales y cierre de garantias. Una impresion silenciosa sin dialogo o nuevas automatizaciones pagas no forman parte de esta entrega.
