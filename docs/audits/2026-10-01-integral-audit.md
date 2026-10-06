# CHETECH: auditoria integral e implementacion

Fecha: 2026-10-01. Aplicacion administrativa interna para reparaciones electronicas. No se transformo en ecommerce ni se modifico la tienda externa que comparte la base.

## Resultado ejecutivo

Se revisaron las 17 secciones administrativas, los accesos permitidos/restringidos del tecnico, consultas y validaciones de negocio, integridad de datos, dependencias, formularios, navegacion y responsive. Se implementaron mejoras comprobables, no solamente una propuesta visual.

Resultado de verificacion final: **65 archivos de prueba y 192 tests aprobados**, lint, typecheck y build de produccion correctos. Baseline de esta sesion: 56 archivos / 161 tests.

No es una certificacion de funcionamiento al 100%. La navegacion con datos reales fue de solo lectura: no se generaron ventas, cobros, gastos, retiros, cambios de estado ni facturas de prueba en el negocio. Las acciones de escritura se cubren parcialmente con tests de validaciones/mocks; falta una base de staging y pruebas transaccionales reales. No se verifico un iPhone fisico ni todos los lectores de pantalla.

El frontend modificado esta en el workspace, **no publicado en el dominio de Vercel**. La sesion de CLI disponible no puede acceder al proyecto CHETECH y pertenece a otro equipo. No se publico en ese equipo ni se hizo push masivo de los cambios preexistentes del repositorio. La unica migracion aplicada a la base en esta auditoria se detalla abajo.

Pendientes del informe: 2 bloques P1, 4 bloques P2 y 1 bloque P3. No se detecto un P0 en el alcance comprobado. Los limites de cobertura no se presentan como bugs confirmados ni como funciones verificadas de punta a punta.

## Evaluacion de interfaz

Puntaje orientativo de revision, no puntaje Lighthouse ni certificacion WCAG:

| Dimension | Puntaje / 4 | Evidencia y limite |
| --- | --- | --- |
| Accesibilidad | 3 | Etiquetas, focus de dialogos/navegacion y contraste corregidos; falta prueba asistiva integral. |
| Rendimiento | 2 | Menos DOM inicial y editores diferidos; el historial completo sigue viajando al cliente. |
| Responsive | 3 | Sin overflow horizontal general en las vistas comprobadas; falta iPhone fisico y texto ampliado. |
| Consistencia visual | 3 | Marca y paleta conservadas, MetricCard compartida; quedan estilos particulares legacy. |
| Claridad y antipatrones | 3 | Jerarquia operativa, semantica financiera y colores utiles; algunos paneles legacy siguen siendo densos. |
| Total | **14 / 20** | Buen estado general, con riesgos pendientes expresos. |

Se mantuvo la identidad grafito/blanco calido y las fuentes locales del negocio. No se agregaron gradientes decorativos dominantes, graficos sin datos, porcentajes inventados ni animaciones que demoren el trabajo. Las metricas existentes justifican cards; no se aplico una plantilla SaaS comercial de manera indiscriminada.

## Skills investigadas y utilizadas

Se consulto el [directorio de Skills.sh](https://www.skills.sh/) y se contrastaron opciones con el stack y el negocio. Entre las skills populares relevantes ya estaban instaladas frontend-design, vercel-react-best-practices, web-design-guidelines y supabase-postgres-best-practices. No se duplicaron.

Se instalaron y leyeron cuatro skills adicionales en `.agents/skills/`:

| Skill | Fuente | Aplicacion al proyecto |
| --- | --- | --- |
| kpi-dashboard-design | [wshobson/agents](https://www.skills.sh/wshobson/agents/kpi-dashboard-design) | Metricas operativas, metodologia visible, estados con acceso a detalle y sin tendencias inventadas. |
| accessibility | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Etiquetas, foco, dialogos y contraste. |
| performance | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Medicion primero, menos DOM inicial y montaje diferido. |
| web-quality-audit | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Cobertura de navegacion, responsive y comprobaciones posteriores al build. |

Tambien se utilizaron las skills locales audit, impeccable/frontend-design, supabase, test-driven-development, webapp-testing, verification-before-completion y requesting-code-review. La revision final independiente fue de solo lectura y termino sin regresiones bloqueantes en los cambios puntuales revisados.

Las busquedas por taller/reparaciones no aportaron una skill especifica suficientemente pertinente como para agregar un sistema externo de RepairShopr, calendarios Lark o conectores de agenda. Se adapto el tablero existente a sus estados reales, sus numeros REP y su agenda Visitas. Una skill es una guia de desarrollo, no una funcion que se instala automaticamente en el navegador.

Para reproducir las instalaciones sin agregar duplicados:

```powershell
npx skills add https://github.com/wshobson/agents --skill kpi-dashboard-design -a codex -y
npx skills add https://github.com/addyosmani/web-quality-skills --skill accessibility performance web-quality-audit -a codex -y
```

En esta PC se utilizo el runtime Node 24 incluido con Codex para el instalador: el Node 20.12.2 del sistema no expone la API de zlib que requiere esa version de skills. Los archivos de skills estan ignorados por Git; estas instrucciones permiten prepararlos en otra PC. No son dependencias de produccion de CHETECH.

## Cambios implementados

### [P1] Historial de ordenes incompleto

`src/features/repairs-access/queries.ts` y `src/lib/read-record-pages.ts`: se elimino el recorte de 500 ordenes. Administracion y tecnico leen paginas de 500 registros con orden estable, abortan ante errores en paginas posteriores y deduplican por ID si una insercion desplaza los offsets. La consulta del tecnico por una orden concreta conserva el limite de un registro.

La lectura de la base mostro 507 ordenes cuando la funcion devolvia 500. Luego se verifico que devolviera las 507. El local siguio ingresando equipos durante la auditoria, por lo que los conteos posteriores pueden cambiar normalmente.

La migracion `supabase/migrations/20261001141000_complete_repair_history_reads.sql` fue aplicada al proyecto productivo. Modifica exclusivamente el limite de la definicion existente de `get_technician_repair_orders(uuid)`. Conserva el payload desplegado, la comprobacion del rol, ACL, SECURITY DEFINER y el resto de la funcion. Es idempotente y aborta si encuentra una definicion inesperada. No reescribe tablas ni montos.

### [P1] Fallas de consultas mostradas como ceros

`src/features/dashboard/queries.ts`: productos, productos mas vendidos, facturacion y liberaciones de placas ahora propagan un error en vez de mostrar una metrica falsa de cero o un listado aparentemente vacio. Se agregaron tests de las cuatro fallas y del conjunto vacio valido.

### [P1] Foco inestable en dialogos

`src/components/ui/dialog-shell.tsx`: cambiar el callback de cierre en un render ya no vuelve a montar el ciclo de foco del modal. Se conserva el ultimo callback de Escape, el trap de Tab y la restitucion del foco al salir. La regresion se reprodujo primero con tests y se comprobo escribiendo en un modal de producto sin guardar.

### [P1] Renovacion de sesion no propagada al servidor

En la revision de logs finales aparecieron respuestas 429 de Auth. La consulta agregada del periodo 14:30-15:04 UTC mostro 41 respuestas correctas y 18 rechazos 429 en `/token`. Durante el barrido tambien vencio una sesion del proxy de pruebas, cuyo manejo de cookies se corrigio por separado. No se atribuyen todos los 429 al uso normal del local.

Una prueba independiente del middleware confirmo un fallo preexistente: `request.cookies` recibia las cookies renovadas, pero `NextResponse` ya habia copiado las cabeceras anteriores. Los Server Components seguian recibiendo el token vencido y podian intentar renovarlo otra vez. El test fallo mostrando las cookies viejas; despues del cambio paso con ambas partes de una cookie renovada y la preferencia ajena a Auth conservada.

`src/lib/supabase/middleware.ts` ahora reconstruye la respuesta de continuidad despues de actualizar las cookies de request, y conserva las cookies destinadas al navegador. No se modificaron `getUser`, los perfiles, RLS, restricciones del tecnico, expiraciones ni limites de Supabase. La [documentacion oficial de SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) describe la necesidad de pasar el token renovado a ambos lados; la [guia de limites de Auth](https://supabase.com/docs/guides/auth/rate-limits) documenta las respuestas 429. Falta una prueba prolongada con expiracion real y varias PCs antes de afirmar que no volvera a haber cierres de sesion.

### [P2] Reposicion truncada

`src/features/dashboard/queries.ts`: se quito `.limit(24)` antes de filtrar stock contra minimo. La consulta paginada devuelve todas las alertas y un contador completo. Lectura SQL al momento de verificar: 84 productos bajo su minimo, de los cuales 82 estaban activos; la pantalla anterior presentaba 24. Se mantuvo el criterio previo de incluir todos los estados, sin cambiar stock ni desactivar productos.

### [P2] Lectura financiera y colores

`src/components/ui/metric-card.tsx`: componente compartido, acentos discretos, importes legibles, iconos decorativos y numeros alineados. Ventas usan azul, egresos rojo, servicio tecnico teal, resultado positivo verde, pendientes ambar y referencias neutras grafito. Cualquier valor negativo adopta tono de egreso, conservando el signo.

Dashboard, Reportes, dashboard del tecnico, centro del taller y Visitas lo reutilizan. No se inventaron costos de reparacion, porcentajes de mejora o rentabilidad por equipo.

La etiqueta anterior "Ganancia real" del dashboard se cambio a **"Flujo neto de caja"**, con descripcion de la formula existente: ingresos menos gastos; no descuenta costos de productos ni retiros de sueldo. El valor y los calculos de saldos permanecen intactos. La ganancia de ventas de Reportes mantiene su calculo propio.

El color del texto de advertencia financiera paso de contraste aproximado 3.38:1 a 5.23:1 sobre su fondo suave. Es una comprobacion puntual de contraste, no una certificacion de todos los colores.

### [P2] Taller y navegacion por estados

`repair-access-command-center.tsx`, `repairs-access-view.tsx` y `repair-access-orders-section.tsx`: los accesos por estado filtran realmente ese estado, limpian filtros incompatibles y los enlaces de orden abren la ficha correspondiente. Los deep links del tecnico buscan la referencia solicitada. El numero REP permanece completo y sin salto en la tabla.

Los filtros ya no reservan un bloque de 780 px que comprimiera el titulo a aproximadamente 218 px en escritorio de 1366 px. Los controles se apilan antes de 1600 px, y las secciones de reparaciones se distribuyen en dos columnas en celular. Cambiar desde un estado al listado transfiere el foco al encabezado sin abrir el teclado en la carga inicial del celular.

### [P2] Menos elementos iniciales sin perder acciones

`product-table.tsx`: muestra 25 productos y carga otros 25 con "Mostrar mas". Filtrar reinicia la ventana; revalidar con los mismos filtros conserva las filas abiertas y el foco. Edicion, permisos, SKU y stock no se modificaron.

`lazy-disclosure.tsx` y `repair-access-workshop-card.tsx`: los formularios tecnicos y del portal se montan al abrirlos por primera vez y permanecen montados al cerrarlos. Se redujo DOM inicial sin borrar los borradores al plegar la ficha.

### [P2] Formularios mas claros y accesibles

Se agregaron nombres accesibles a filtros de Productos, Placas, Visitas y Cuotas; se asociaron etiquetas/IDs en metas, Caja, terciarizaciones y editores de orden. Las filas editables de Cuotas tienen IDs independientes. Los indicadores de objetivos en Reportes tienen valores ARIA limitados al rango valido.

Se conservaron el buscador real de ordenes, la ausencia de buscador global inutil en mobile y la ausencia de WhatsApp/llamar en las fichas moviles del tecnico.

### Dependencias

Se actualizo Vitest 2 a 3.2.7 para corregir la alerta critica del entorno de pruebas y permitir tests reales de interaccion con Testing Library + JSDOM. PostCSS se actualizo a 8.5.28 y se aplicaron actualizaciones compatibles mediante `npm audit fix`, sin `--force` ni salto de version mayor de Next.

El audit inicial tenia 15 alertas: 1 critica, 8 altas, 5 moderadas y 1 baja. El final tiene **4 alertas: 0 criticas, 1 alta, 2 moderadas y 1 baja**. No significa que la aplicacion carezca de vulnerabilidades.

## Cobertura por modulo

Todas las rutas de esta tabla devolvieron contenido correcto como administrador en el build local final. Se revisaron las 17 en viewport movil; los flujos interactivos comprobados no guardaron datos reales.

| Modulo | Comprobacion realizada | Limite de cobertura |
| --- | --- | --- |
| Dashboard | Rango mensual, KPIs, saldos, reposicion desplegable y acceso por rol. | Sin carga nueva de operaciones. |
| Productos | Busqueda + categoria combinadas, precios, carga de 25/50 filas, modal y foco. | No alta, edicion ni eliminacion real. |
| Ventas | Render del carrito/cobros/historial; validaciones existentes de totales y pagos divididos aprobadas. | Sin venta/stock de prueba en produccion. |
| Gastos | Formulario, fechas, historial, validaciones y action tests. | Sin egreso real. |
| Visitas | Agenda, fechas/estados, formulario y etiquetas. | Sin nueva visita ni mensaje al cliente. |
| Placas | Filtros, listado, liberaciones y tests del calculo neto/pendiente. | Sin venta ni liberacion manual real. |
| Sueldos | Vista, retiros y tests del calculador/fondeo. | Sin retiro ni cambio de parametros. |
| Pedidos | Estado vacio/listado y vista de reposicion existente. | Sin nuevo pedido. |
| Cuotas | Listado, simulacion/formulario, etiquetas, queries/model tests. | Sin cobro de cuota real. |
| Caja | Saldos/movimientos, filtros, etiquetas y tests de agregados. | Sin ajuste manual. |
| Cambio de balance | Vista, modelo y restricciones. | Sin transferencia entre cuentas. |
| Reportes | Rango, indicadores, comparacion y objetivos, tests de agregados. | No se valido cada archivo exportado en Excel. |
| Pagos de reparaciones | Listado/formulario, fechas y validacion de montos/pagos. | Sin cobro real. |
| Reparaciones | Panel, estados, detalle, REP, tecnico, deep links y borradores en mobile. | Sin guardar estados, importaciones o garantias reales. |
| Terciarizaciones | Formulario/listado, labels y schema/query tests. | Sin alta ni pago a taller. |
| Facturacion | Listado y permisos; mapping de items probado. | Sin emitir factura ni prueba fiscal externa. |
| Configuracion | Metas, backup, permisos y ausencia del editor de caja base. | Sin restauracion de backup ni cambios sensibles. |

Login tecnico con las credenciales existentes funciono en el dominio actual. En la vista local autenticada el tecnico pudo ver Dashboard, Productos, Visitas y Reparaciones. Caja redirigio a Dashboard con "Sin permiso". Backup y exportacion de ventas devolvieron redireccion de rechazo. Algunos rechazos de paginas usan streaming de Next y retornan HTTP 200 con una redireccion embebida; no se contabilizaron como autorizaciones validas solo por el codigo HTTP.

Una simulacion SQL con el rol autenticado del tecnico, dentro de una transaccion terminada en ROLLBACK, confirmo cero filas accesibles en ventas, gastos y retiros. La funcion de ordenes devolvio el historial sin campos financieros de cobro ni DNI estructurado. Los textos libres de falla/notas pueden contener informacion que alguien haya escrito manualmente; el rol no sanitiza esos textos.

## Integridad y base de datos

Proyecto CHETECH activo en **sa-east-1 / Sao Paulo**, verificado por metadata del proveedor. No se migro de region en esta sesion.

Las consultas de integridad devolvieron cero en: stock negativo, numeros duplicados de venta/reparacion, ventas sin medios de cobro, diferencias entre subtotal y suma de pagos, vinculos de clientes rotos y tablas publicas sin RLS. Esto cubre invariantes concretas, no toda la contabilidad.

Los avisos de RLS sin politicas correspondian a tablas privadas de respaldo; los SECURITY DEFINER publicos de catalogo pertenecen a la tienda compartida y no se revocaron. La proteccion de contrasenas filtradas aparecio desactivada en Supabase Auth; quedo como accion de seguridad pendiente. No se cambiaron usuarios, contrasenas ni permisos.

Git solo tiene `.env.example` y `.env.repairs-access.example` como archivos de entorno versionados. No se imprimieron ni incorporaron claves de servicio al frontend o al informe.

## Mediciones

Mediciones locales, no promesas de latencia en Vercel ni datos de usuarios reales. El primer barrido incluyo compilacion de desarrollo; por eso no se comparan esos tiempos con `next start` para afirmar una mejora de velocidad.

Con condiciones de desarrollo equivalentes, el HTML inicial de Productos administrador paso de 1,948,905 a 353,073 bytes: aproximadamente **82 % menos HTML inicial**. Tecnico: 699,540 a 193,700 bytes, aproximadamente 72 % menos. No representa 82 % menos consultas, JavaScript o tiempo de respuesta.

Medicion final en `next start`, build y cache calientes, Supabase real, proxy local autenticado de solo lectura, tres muestras por ruta:

| Ruta / rol | Mediana | HTML final aproximado |
| --- | --- | --- |
| Dashboard / administrador | 286 ms | 221 KiB |
| Productos / administrador | 270 ms | 320 KiB |
| Reportes / administrador | 258 ms | 138 KiB |
| Reparaciones / administrador | 701 ms | 1.19 MiB |
| Productos / tecnico | 251 ms | 165 KiB |
| Reparaciones / tecnico | 614 ms | 1.56 MiB |

Los tiempos miden la descarga completa del HTML a traves del proxy, no TTFB, INP, LCP ni una conexion de celular. Reparaciones sigue siendo la vista mas pesada. El dashboard crecio al mostrar correctamente las 84 alertas en lugar de 24; no se oculto este costo de completitud.

Anchos revisados: 375, 768, 1024 y 1366 px. Las 17 rutas se comprobaron a 375 px; Dashboard, Reportes, Productos, Reparaciones y Visitas se comprobaron ademas a los otros tres anchos. El ancho total del documento coincidio con el ancho util, sin overflow global. No equivale a probar todos los dispositivos, orientaciones o zooms.

Evidencias locales: `tmp/backups/audit-routes.json`, `tmp/backups/audit-production-timing.json`, `tmp/backups/2026-10-01-dashboard-audit.jpg` y `tmp/backups/2026-10-01-workshop-mobile-audit.jpg`. El preview temporal solo acepto lecturas hacia la aplicacion; sus sesiones expirables se generaron para roles existentes. No se enviaron comunicaciones ni se guardaron operaciones.

## Pendientes priorizados

### [P1] Escrituras y restauracion en entorno aislado

Crear staging con datos anonimizados y probar login/refresco al vencer el token y en varias PCs, alta de venta con uno/dos medios, descuento/restauracion de stock, cobro de reparacion, liberacion de placa, cuotas, retiro de sueldo, anulacion y permisos. Los tests actuales no reemplazan esa prueba. El 429 observado durante el barrido sigue siendo un limite de cobertura de Auth bajo carga, pese a la correccion puntual probada. Comprobar iPhone/PWA fisicamente antes de afirmar experiencia completa.

### [P1] Biblioteca Excel y backup recuperable

`xlsx@0.18.5` sigue teniendo dos advisories altos sin solucion en la version publicada en npm. El endpoint de backup escribe Excel; los parsers estan en scripts de importacion. No se verifico explotacion en este sistema. Hasta migrar/probar una distribucion oficial corregida o una alternativa, no importar archivos no confiables.

`src/app/api/backup/route.ts` exporta siete conjuntos legacy y usa lecturas sin paginas. Con limites habituales de PostgREST puede recortar al crecer mas alla de 1000 filas. Actualmente se midieron 614 movimientos, pero eso no valida el backup futuro. Ademas no exporta todos los modulos nuevos. No debe confundirse este Excel con un respaldo completo restaurable de PostgreSQL. Implementar copia completa y simulacro de restauracion antes de depender de ella para recuperacion.

### [P2] Historial verdaderamente paginado en servidor

La lectura por bloques de ordenes corrige el recorte y los duplicados, pero se sigue enviando todo el historial como props y la RPC tecnica puede materializar todo el resultado por pagina. Implementar cursor `(created_at, id)`, filtro y limite dentro de una RPC segura y agregados separados del listado. Probar inserciones concurrentes, cambio de permisos y limites con miles de equipos. La deduplicacion actual no equivale a una instantanea transaccional cuando se modifican/borran registros entre paginas.

### [P2] Herramientas de desarrollo pendientes

Quedan dos avisos moderados asociados a Vitest/@vitest/mocker y uno bajo de esbuild en Windows. La correccion de Vitest exige un salto mayor con requisitos de Node distintos; no se uso `npm audit fix --force`. Usar una version LTS de Node compatible con todos los paquetes y actualizar/probar estas herramientas en un cambio separado. No exponer servidores de test/desarrollo a internet.

### [P2] Seguridad operativa del local

Activar proteccion de contrasenas filtradas donde el plan de Supabase lo permita; usar contrasenas distintas para tecnicos; evitar que trabajen con la sesion administrativa del propietario y bloquear la PC al ausentarse. Ocultar el editor de caja base no neutraliza las otras facultades de una sesion admin.

### [P2] Consultas del taller y agenda

La seccion legacy Consultas aun presenta algunas cards informativas con textos tipo "Filtrar", sin todos los drilldowns implementados. El Panel principal ya tiene accesos por estado reales. Siguiente evolucion: consultas por demora/retiro/garantia, carga de trabajo por tecnico y agenda por dia/semana usando Visitas, sin contratar ni conectar un calendario externo por defecto.

### [P3] Unificacion visual restante

Continuar consolidando styles legacy, tamanos tactiles pequenos de acciones secundarias, copy, estados de error y lectura con texto ampliado. Mantener la marca, no agregar color a cada superficie ni animaciones continuas. Pulido final despues de cerrar las verificaciones operativas.

## Publicacion y preservacion

### Actualizacion: publicacion completada el 1 de octubre de 2026

Los cambios de la aplicacion ya estan publicados en `https://chetech-admin.vercel.app`. Vercel confirmo el despliegue productivo `dpl_AQ2Ugmsw4ie9wsWNjpBsFNjJ8uHv` en estado READY, con ese dominio como alias y funciones en `gru1`. Se uso la cuenta y el proyecto originales de CHETECH, sin cambiar la vinculacion local ni la sesion global de Sahar.

Se publicaron 319 archivos de codigo/assets/configuracion desde una copia verificada del workspace, sin `.env`, credenciales, logs ni archivos temporales. Antes de publicar pasaron 192 tests, lint, TypeScript y build; la compilacion remota tambien paso. Despues del despliegue se comprobaron las 17 rutas administrativas, las cuatro rutas permitidas a tecnicos y cinco denegaciones de acceso mediante GET autenticados de solo lectura. No se guardaron operaciones ni se ejecutaron migraciones durante esta publicacion. Evidencia: `tmp/backups/2026-10-01-production-publish-smoke.json` y `tmp/backups/2026-10-01-published-dashboard.png`.

La verificacion de escrituras en staging, restauracion de backup y prueba fisica de iPhone/PWA siguen pendientes. El bloqueo de publicacion que se describe a continuacion corresponde al cierre inicial de la auditoria, ya resuelto.

### Estado al cierre inicial de la auditoria

El frontend necesita un despliegue verificado en el proyecto correcto de Vercel. La vinculacion local apunta a CHETECH, pero el login de CLI disponible no tiene ese equipo/proyecto; no se modifico la vinculacion ni la cuenta global para forzarlo. El repositorio tambien conserva numerosos cambios staged/unstaged de trabajos previos, por lo que no se hizo commit/push global durante esta auditoria.

La migracion puntual de lectura de ordenes SI esta aplicada en la base productiva. Los cambios visuales, de accesibilidad, nuevos tests, dependencias y propagacion de cookies renovadas permanecen locales. Las sesiones temporales y servidores de comprobacion no son parte del despliegue.

No se modificaron saldos base, ajustes, historiales, cuentas, precios, stock, facturas, fechas de registros, credenciales, reglas de pago ni la logica de los formularios de escritura de negocio. Se modificaron lecturas, presentacion, etiquetas y navegacion; la unica modificacion de base fue el limite de lectura de ordenes dentro del mismo rol.
