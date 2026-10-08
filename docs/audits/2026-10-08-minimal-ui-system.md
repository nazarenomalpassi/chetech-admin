# CHETECH: implementacion integral de UI/UX minimalista

Fecha: 2026-10-08. Base de comparacion: `a60908c` (origin/main).
Plan autorizado: `docs/superpowers/plans/2026-10-08-minimal-ui-system.md`.

## Resultado

Se adapto el frontend de las 17 secciones administrativas, los componentes compartidos,
el acceso, las pantallas de error y la vista imprimible de comprobantes. Se conserva
la identidad grafito y el logo CHETECH. Source Sans 3 se sirve localmente para texto
operativo; las fuentes originales de marca y documentos se mantienen.

Los controles tienen alturas tactiles de 44px, bordes consistentes, foco visible y
campos moviles de 16px. Se redujeron sombras, gradientes, etiquetas en mayusculas y
tarjetas anidadas. Los importes y estados conservan colores semanticos y texto.

## Cobertura del plan

| Area | Implementado |
| --- | --- |
| Navegacion | Sidebar izquierdo compacto, grupos existentes, nombres completos, cabecera reducida, menu movil y enlace de salto al contenido. |
| Componentes | Botones, inputs, selects, textarea, badges, cards, metricas, modales, carga, errores y acciones secundarias compartidas. |
| Reparaciones | Actualizacion en fichas y tabla, numero REP completo, ficha de ingreso compacta, detalle, coordinacion, repuestos, fotos, portal, historial y entrega. |
| Productos | Busqueda y filtros principales visibles, opciones avanzadas plegables con indicador, filas adaptadas a tablet y edicion con proteccion de cambios. |
| Ventas y gastos | Carga compacta, carrito, cobros distribuidos, historial separado, acciones administrativas secundarias y etiquetas financieras precisas. |
| Placas | Precio publicado separado de neto/pending/liberado; vender/liberar visibles segun estado y dialogos que mantienen el borrador. |
| Operacion | Visitas, terceros y cobros de reparaciones con orden vinculada y acciones directas. La busqueda de una REP existente enfoca su libro de cobros. |
| Finanzas | Dashboard, reportes, caja, transferencias, sueldos, cuotas y pedidos con periodos visibles y saldos/pending/simulacion diferenciados. |
| Facturacion | Distincion entre documento interno, cobro y emision fiscal manual; selectores largos con busqueda y vista A4/PDF conservada. |
| Configuracion y acceso | Ajustes agrupados, caja base bloqueada, login compacto, autocompletado y mostrar/ocultar contrasena. |
| Responsive | Matriz completa 360/390/768/1024/1366/1920px, texto ampliado al 200% y recorridos con emulacion tactil. |

## Correcciones comprobadas durante la revision

- El menu de acciones usa una superficie superpuesta para no quedar recortado por tablas.
  Conserva el submit nativo y devuelve el foco sin robarlo a un nuevo modal.
- Los importes calculados no muestran ruido de coma flotante. La escritura acepta
  coma decimal y mantiene separadores/ceros decimales durante la edicion.
- Cancelar una venta editada sigue accesible en espacios angostos.
- Productos conserva escritura mas reciente, acentos y espacios cuando llegan
  respuestas anteriores. Cambiar categoria/estado cancela el debounce anterior;
  limpiar y navegar por historial conservan la intencion actual.
- Los filtros de terceros se reorganizan para que Limpiar siga accesible con texto ampliado.
- La carga manual de una REP con registro financiero traslada foco y scroll al libro de cobros.

## Verificacion

- 844 pruebas aprobadas, 69 omitidas por configuracion opt-in; 171 archivos de prueba.
- Lint, tipos y build de produccion correctos, sin advertencias pendientes.
- 102 combinaciones ruta/resolucion: sin errores de JavaScript, desborde horizontal
  general ni controles visibles sin etiqueta; referencias REP completas.
- 17 rutas con texto ampliado al 200%: acciones accesibles, sin recorte fuera de sus
  contenedores de desplazamiento.
- Recorridos tactiles: login, busqueda, borrador/foco de modal, escritura de reparaciones,
  estados aceptado/rechazado/retirado y entrada de cobros con uno o varios medios.
- Staging transaccional: venta/stock/items/pagos, RLS, rollback, autorizacion del taller,
  repuestos, factura interna, cobros parciales/completos y anulacion de pagos.
- Smoke autenticado: rutas admin/tecnico, rechazo por permisos, emision fiscal deshabilitada
  en staging, PDF privado y adjuntos privados reales con acceso firmado.
- Cuatro revisiones independientes por alcance; los hallazgos se reprodujeron y corrigieron.

Las escrituras de prueba se hicieron exclusivamente sobre datos sinteticos locales.
No se cambiaron consultas, migraciones, autenticacion, numeracion ni reglas contables.

## Presupuesto de carga

Se genero un build de la base exacta `a60908c` en un directorio aislado y se compararon
los manifiestos con el build final. Ambos conservan Next.js 15.5.25. Los 637 archivos
archivados de la base se verificaron byte por byte. El calculo coincide con la API de
tamanos de Next.js para las 46 mediciones de pagina.

First Load JS gzip: Productos 145.76 -> 146.18 kB; Reparaciones 233.17 -> 232.42 kB;
Placas 143.47 -> 142.22 kB. El mayor aumento es Terceros: 1.12 kB, 0.92%.
El JavaScript inicial unico pasa de 370.08 a 366.30 kB. La fuente operativa agrega
170188 bytes de WOFF2, servidos localmente y reutilizados por cache.

Esto verifica el presupuesto de JavaScript, no una mejora porcentual de velocidad
real: configuracion publica sintetica, IDs de chunks y condiciones de red pueden
introducir diferencias pequenas. No se atribuye toda variacion exclusivamente al UI.

## Evidencia y limites

La evidencia local queda en `tmp/qa/minimal-ui-20261008/`: inventario de controles,
capturas, interacciones, resultados de pruebas y comparacion de artefactos.
Los scripts reproducibles estan en `scripts/qa/` y requieren Playwright + Chrome;
en Codex se utilizo el runtime incluido mediante NODE_PATH.

Se uso emulacion movil en Chrome; no se afirma una prueba fisica de iPhone/Safari/PWA,
ni certificacion integral WCAG o prueba de emision fiscal real. Las pruebas automaticas
complementan la comprobacion manual; no certifican todas las situaciones del local.

Fuente tipografica y licencia: https://github.com/adobe-fonts/source-sans.
Guias aplicadas: frontend-design, impeccable, ui-ux-pro-max, accesibilidad, patrones React
y revision de interfaces; criterios distill/normalize/clarify/adapt/harden contrastados
con sus referencias de Skills.sh en la etapa de planificacion.

## Publicacion

La rama de entrega es `codex/minimal-ui-system`. El PR y el deployment final de Vercel
se verifican antes de informar la publicacion al usuario. El cambio conserva un punto
de retorno mediante el historial de Git y deployments del proyecto existente.
