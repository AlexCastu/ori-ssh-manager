# Plan de pruebas y resultados

## Cabecera, selección y niveles de carpetas · 2026-11-15

64 pruebas declaradas. En esta revisión se ejecutaron 54 y se omitieron 10 por
no activar fixtures externas: seis de Docker, tres de terminal/contraseñas y
la comprobación opcional del inventario real. Esta última y SSH por contraseña
ya se ejecutaron en la revisión anterior.

FolderOrganizationTests comprueba crear raíces, subcarpetas, carpetas hermanas
y superiores; conserva IDs, hosts y conexiones al guardar/reabrir SQLite.
La selección BAF incluye sus descendientes y excluye otro BAF de otra rama.
Los movimientos circulares y referencias inexistentes fallan sin mutación parcial.

En la app Release se seleccionó el centro vacío de la fila PRE/BAF: aparecen sus
14 conexiones a la derecha. Después se abrió Diagrama, se filtró un único equipo
y se volvió a pulsar BAF: búsqueda vacía, Filas activa y 14 conexiones restauradas.
El clic derecho ofrece subcarpeta, hermana, superior y renombrar/mover. Se abrió
Insertar carpeta superior y se canceló sin cambios. Se comprobó la cabecera sin
selector de entornos y con el fondo superior integrado en la paleta.

La comparación readonly con `ori-antes-arbol-20261115-195851.sqlite` confirma
los 148 perfiles, recorridos y carpetas sin modificaciones; integridad `ok`.
La compilación Release, firma ad hoc, formato Swift y diff están verificados.


## Credenciales portables y retirada de VPN · 2026-11-15

62 pruebas declaradas (57 de núcleo y cinco de terminal/autenticación).
Se ejecutaron 54; quedan omitidas seis integraciones Docker y dos pruebas
optativas de terminal/medición. El escenario manual de contraseñas con OpenSSH
real y una fixture Paramiko se retiró el 2026-11-15 (queda en el historial).

El archivo portable se restaura sin clave local, rechaza contraseña incorrecta
y alteración de bytes. Una implementación Python independiente descifra el
JSON generado por Swift: `PORTABLE_ARCHIVE_INTEROPERABILITY_OK`.
La importación readonly del inventario real confirma una contraseña disponible
por cada perfil de origen, incluida la herencia de planta y los overrides.
La importación posterior desde la UI guardó 148 contraseñas en la instalación
actual. Se verificó la correspondencia con sus 148 perfiles, integridad SQLite,
permisos y conservación exacta de perfiles/rutas respecto al backup previo.
La app Release muestra navegación sin VPN y el editor de saltos indica una
contraseña guardada sin mostrarla. No se hicieron accesos corporativos en QA.

VPN/Ivanti se retiraron de ORIApp: sin sección, editores, detector, coordinador
ni bloqueo por requisitos. Las pruebas de los tipos históricos se conservan
para compatibilidad con archivos previos; ya no representan una función activa.

## Ampliación del 2026-11-15

La suite contiene ahora 58 pruebas declaradas (54 de núcleo y cuatro de terminal).
Con `ORI_ACCESS_DIRECTORY` se han ejecutado 50; las seis integraciones SSH y las
dos pruebas optativas de terminal/medición quedan omitidas sin sus fixtures.
El inventario corporativo se valida en memoria sin conexiones remotas. Las nuevas
pruebas cubren JSON previo sin los campos nuevos, persistencia de organización y
raíces, comandos conservados tras mover, inserción/reordenación de saltos y ciclos,
actividad VPN inferida sin autorización estricta, overrides y omisión de contraseñas,
importaciones repetidas y Git real con remoto bare local, fetch, pull, cambios
locales y divergencia. La preparación Git solo crea commits sintéticos temporales.

La importación real desde la UI añadió 148 conexiones y conservó la existente:
149 perfiles en SQLite, 37 carpetas y tres espacios Git; integridad `ok`.
La UI de Maqueta muestra siete repositorios tras reubicar su carpeta en macOS.
Se observó la paleta y el mapa en una ventana real. No se declara comprobada toda
la interacción drag/drop, VoiceOver, Ivanti corporativo ni el lanzamiento del CLI
de Claude dentro de VS Code. Este último usa una tarea de workspace que requiere
el CLI instalado y la autorización de tareas de VS Code si este la solicita.

Debug/tests, Release, formato Swift estricto, Bash y plist verificados.
El build reemplaza el ejecutable por rename para conservar una instancia ya abierta.
La firma continúa siendo ad hoc para uso local.

### Filas, paletas y rutas SSH con espacios

Conexiones sustituye su cuadrícula por filas adaptables y conserva el diagrama.
Se inspeccionaron las filas y los temas verde y naranja en la app real.
Tras separar el catálogo se muestran 145 destinos y cuatro máquinas de salto,
conservando los 149 perfiles persistentes. La selección y los botones usan la paleta
de cada sección; no dependen del azul de selección del sistema.

`proxyJumpReadsConfigurationWhenDataDirectoryContainsSpaces` ejecuta el OpenSSH
10.5 del Mac con uno y dos bastiones. Reprodujo el fallo original `Can't open user
config file` antes de corregirlo. Después verifica lectura de la configuración y
el intento contra un puerto reservado de loopback que no presta ningún servicio.
No usa servidores corporativos ni necesita Docker. Si el directorio solicitado
tiene espacios o metacaracteres, SSHRuntimeFiles crea un directorio temporal
privado con ruta segura para el ProxyCommand implícito de OpenSSH.

La reorganización del catálogo tiene una prueba de migración transaccional:
ALC/MMT en PRE, MDE en PRO, Execution/STF en Maqueta y pasarelas separadas.
Conserva IDs, rutas, comandos e historial; repetirla no altera datos y permite
renombrar carpetas principales sin colisiones de identificadores.

La comprobación final en la app Release muestra PRE/PRO/Maqueta en cascada,
Maqueta → Execution desplegado con sus seis equipos, cuatro saltos reutilizables
en Túneles y siete repositorios en filas con iconos de estado y acciones.
Se abrió y canceló el editor de una máquina de salto sin escribir datos.
La comparación readonly con el backup previo confirma todos los IDs y las 149
rutas intactas, preferencias e historial anterior conservados e integridad `ok`.
No se ejecutaron los botones de Claude ni operaciones Git corporativas.

## Entorno de esta sesión

2026-11-14, macOS 27.2 arm64, Xcode 27.2, Apple Swift 6.4.2.
Objetivo mínimo de compilación: macOS 15. No se ha ejecutado en un Mac con macOS 15.
Dependencias fijadas: SwiftTerm 1.99.1 y GRDB 7.12.0.

## Regresión histórica, antes de cambios

| Comprobación ejecutada | Resultado |
|---|---|
| pnpm test | 76/76, ocho archivos |
| pnpm lint | Correcto |
| pnpm build | Correcto; avisos existentes de browserslist/chunks/import dinámico |
| cargo test --locked en src-tauri | 39 aprobadas y dos integraciones ignoradas |

Los fuentes y pruebas históricos no se han modificado; se conservan como respaldo
funcional de la migración. El CI histórico tampoco se ha sustituido.

## Pruebas Swift

El comando completo usado es:

```bash
bash native/scripts/integration-environment.sh
ORI_SSH_FIXTURES="$PWD/native/build/integration" swift test --package-path native --cache-path native/.cache
```

Sin ORI_SSH_FIXTURES se omiten las integraciones SSH y la medición optativa; el PTY
local y las unitarias siguen ejecutándose. Swift Testing informa por separado de
los dos targets de pruebas; los casos parametrizados tienen varias ejecuciones.
Los totales finales y el inventario están también en DELIVERY.md.

Cobertura ejecutada:

- Argumentos SSH directos, usuarios, puertos, identidades con espacios, ProxyJump
  ordenado, IPv6, túneles L/R/D y controles de host key/agente.
- Entradas maliciosas en hosts, usuarios y rutas; puertos fuera de rango;
  ciclos, saltos repetidos y referencias eliminadas.
- Parser de evidencia SSH, fragmentación entre lecturas y CRLF; no confundir
  el bucle de transporte con la petición shell aceptada.
- Clasificación de errores permanentes y backoff limitado con jitter.
- Persistencia, revisión, transacciones, actualización sin perder comandos/eventos,
  migraciones al reabrir y 20 mutaciones concurrentes.
- Importación CSV estricta, jerarquía con nombres repetidos, agente, errores de
  puerto, recibos de importación y exportación sin notas/comandos/rutas de claves.
- Base SQLite histórica creada por la prueba: IDs, carpetas, comandos, logs,
  utilizable como salto y fechas con milisegundos. Bytes de origen sin modificar.
- VPN simulada: identidad no confirmada por instalación/utun, identidad distinta,
  observación caducada, TCP sin identidad, DNS y políticas de incertidumbre.
- Requisitos conjuntos de servidor, bastión referenciado, túnel y workspace.
- Importación nativa sin autoarranque/confianza heredada; historial superior a
  10.000 entradas sin purga y exportación completa independiente del límite visual.
- Procesos reales propios: salida, timeout, stop idempotente y liberación del puerto.
- PTY real local: Unicode, ANSI, resize, salida estando desadjuntado y mismo PID.
- Registro propietario de terminal y bloqueo de lectura remota del portapapeles.

## Integración SSH real, aislada y ejecutada

Tres contenedores Alpine/OpenSSH, red Docker específica y puertos Mac 22401–22403
publicados solo en 127.0.0.1. Cuenta de pruebas con contraseña aleatoria interna,
autenticación por contraseña desactivada y claves cliente desechables. Host keys
sembradas desde los propios contenedores, sin aceptar claves por escaneo no fiable.
El Docker build context excluye la clave privada. No se accede a producción.

| Escenario | Evidencia |
|---|---|
| Directo, un salto y dos saltos | Proceso gestionado y HTTP real a través de -L |
| Local forwarding | curl obtiene ORI_SERVICE_OK desde el servicio del contenedor |
| Remote forwarding | curl ejecutado dentro del servidor a su listener remoto |
| SOCKS | curl --socks5-hostname alcanza el servicio privado |
| Host key nueva no conocida | BatchMode + verificación estricta falla, sin retry |
| Host key modificada | Rechazo explícito, sin retry |
| Starts concurrentes y stop durante start | Ningún proceso administrado restante |
| Pérdida/restauración de servidor local | Backoff, reconexión real y cancelación de retry |
| Terminal SSH interactiva | Shell aceptada, comando Unicode y ejecución de vi |
| Independencia de túnel | Cerrar la terminal conserva el forwarding y su HTTP |

No se declara probado MFA/password corporativo, htop si no está instalado, ni todos
los servidores legacy. Las claves por salto se validan en construcción de config;
la integración multisalto usa la identidad desechable del entorno de prueba.

## Medición de recursos ejecutada

`measureFivePTYsAndDescriptorCleanup` abre cinco PTY reales, envía 2.500 líneas
Unicode y los cierra. El archivo MEASUREMENTS.json conserva la última medición.
Mide CPU, tiempo, pico RSS del **proceso de pruebas** y descriptores antes/durante/
después. No es una medición de consumo idle de la ventana de ORI ni una prueba
Instruments de fugas o estrés prolongado. No se fijan umbrales de rendimiento sin
un presupuesto medido para el producto.

## Compilación y empaquetado

Swift build Debug, Swift test y build Release por SPM ejecutados correctamente.
`build.sh` genera ORI.app, copia el icono/recursos y firma localmente ad hoc.
Swift format lint --strict, Bash syntax y plutil de Info.plist/proyecto comprobados. Se comprueba la firma con
`codesign --verify --deep --strict native/build/ORI.app` antes de entrega.

La configuración Git global core.autocrlf=true convertía terminfo de SwiftTerm a
CRLF y rompía su generador. El script corrige solo ese artefacto de checkout y
sobrescribe autocrlf únicamente en los subprocesos del package manager. No cambia
la configuración Git del usuario ni parchea algoritmos de la dependencia.

`xcodebuild` reconoció el proyecto y resolvió los paquetes, pero se detuvo en
Validate plug-in SwiftTermBuildInfoPlugin. Debe revisarse/habilitarse desde Xcode
si este solicita confianza; no se usó skipPackagePluginValidation. También avisó
de un CoreSimulator desactualizado, que no es el destino de esta app macOS.
El workflow Native macOS quedó preparado; no se ha ejecutado en CI remoto.

## Revisiones pendientes, no presentadas como aprobadas

- Cobertura completa de navegación y formularios por interacción UI, foco en cada
  control, VoiceOver, Reduce Motion y contraste medido claro/oscuro.
- Veinte terminales SSH / varios túneles durante horas, Instruments, CPU idle,
  memoria, estado tras sleep/wake y cierres forzados del sistema.
- Ivanti instalado/activo, SSO/MFA, varias VPN corporativas, split DNS y split routes
  reales. Las unitarias no se sustituyen por afirmaciones sobre una VPN activa.
- Hosts legacy específicos y equivalencia de todos los gestos del frontend anterior.
- Firma Developer ID, notarización e instalación en un equipo limpio/macOS 15.

La aplicación histórica se mantiene hasta aprobar esa paridad. Un botón o una
clase no se consideran una prueba funcional: la integración de red anterior sí
se comprueba mediante tráfico y resultados reales del entorno aislado.
