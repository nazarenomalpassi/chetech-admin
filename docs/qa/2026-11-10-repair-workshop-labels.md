# QA: etiquetas de reparaciones 80 x 50 mm

## Alcance e invariantes

- Dos puntos de entrada: confirmacion de ingreso guardado y cabecera de ficha existente.
- Nueva pagina privada de impresion, sin menu lateral, y endpoint PDF privado de solo lectura.
- Sin cambios en acciones de alta, tablas, migraciones, secuencias, cobros, stock o autenticacion.
- QR a la ficha original con sesion requerida. Reimpresion conserva UUID y REP.

## Evidencia local

- Pruebas primero fallidas para el generador y la integracion del boton al ingreso; luego pasando.
- Endpoint: permiso antes de lectura, UUID, ausente/denegado, errores de DB/render, dominio configurado y repeticion solo de RPC de lectura.
- Componente: enlace nativo en nueva ventana, PDF valido antes de mostrar iframe, errores/reintento, blobs/timers limpiados, fallback de impresion.
- Carrera manual/automatica reproducida con dos solicitudes; correccion cancela el temporizador y deja una sola solicitud. Revisada independientemente.
- Pruebas PDF: una pagina exacta de 226.771654 x 141.732283 pt; fuentes embebidas, logo original, margenes, campos largos y truncado explicito.
- Muestras ficticias renderizadas: QR decodificado en 203/300 dpi y en la muestra de campos largos. Ninguna orden real creada.
- Componente real montado en Chrome headless aislado a 1366 x 800 y 390 x 844: sin errores JavaScript ni overflow horizontal. PDF real y servidor loopback; la salida de impresion se sustituyo por un contador, una solicitud por carga, cero escrituras HTTP.
- Se verifico el trazado de despliegue: fuentes y SVG originales incluidos en el endpoint nuevo.

## Limites

La prueba de flujo autenticado contra Postgres aislado no pudo iniciarse porque Windows rechazo publicar el puerto reservado 127.0.0.1:54339. No se altero esa configuracion ni se uso produccion como reemplazo. Auth/RPC estan cubiertos por pruebas unitarias y las rutas nuevas se comprueban sin sesion despues del despliegue. No confundir el harness de navegador con una prueba integral de DB real.

Falta comprobacion fisica del controlador, orientacion, rollo, adhesivo y lectura en los celulares del local. Chrome headless no permite certificar el dialogo del sistema ni la salida a una impresora; queda alternativa directa `Abrir PDF`. Los 69 tests de integracion omitidos por el entorno son preexistentes y no se habilitaron con credenciales reales.
