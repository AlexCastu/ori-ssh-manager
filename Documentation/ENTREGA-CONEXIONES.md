# Conexiones, VPN y repositorios · 2026-11-15

Actualización posterior: VPN e Ivanti se han retirado de la interfaz y del flujo
de conexión. Las contraseñas se guardan en un almacén propio y la exportación
completa las incluye cifradas. Véase [CREDENTIALS_PORTABLE.md](CREDENTIALS_PORTABLE.md).
Las limitaciones de credenciales/VPN que siguen pertenecen a la entrega anterior.

Última revisión de Conexiones: cabecera compacta sin selector global de entornos,
árbol solo de carpetas con selección de fila completa y menús contextuales para
insertar niveles superiores, hermanos e hijos y editar/mover carpetas. Seleccionar
BAF limpia los filtros y muestra sus 14 destinos en Filas. La UI y la persistencia
se verificaron; los perfiles, rutas y carpetas actuales se conservan intactos.

## Cambios

- Conexiones como entrada principal, filas ordenables, movimiento entre carpetas
  y cambio de padre de carpetas por drag/drop. Los filtros incluyen descendientes.
- Diagrama SwiftUI con posiciones persistentes, zoom, bastiones arrastrables,
  inserción/reordenación/eliminación de saltos y validación antes de guardar.
  Guardar y conectar usa la ruta persistida. El editor advierte de cambios externos.
- Catálogo de máquinas de salto en Túneles, reutilizado por referencia desde
  Conexiones y el diagrama. Los reenvíos de puertos tienen otra pestaña y siguen
  siendo independientes de las terminales.
- VPN: servicios dinámicos, inferencias mediante interfaces asociadas, notificaciones
  de interfaces/Link y refresco sin devolver observaciones pendientes a autorización.
  La identidad estricta sigue exigiendo confirmación pública.
- Repositorios: espacios con profundidad configurable, descubrimiento de repos y
  worktrees, estado porcelain v2 con nombres especiales, rama/upstream, cambios y
  ahead/behind y una fila por repositorio. Iconos para estado, Finder, Claude Code
  en consola, VS Code, fetch y pull --ff-only; Claude en VS Code en el menú.
- Paletas por sección: verde en Conexiones, azul en Túneles, naranja en Repositorios,
  violeta en Terminales, cian en VPN, rosa en Workspaces y coral en Diagnósticos.
  Cambian fondos, selección, paneles y botones; herramientas secundarias agrupadas.
- Corregido el corte de `Application Support` al conectar por ProxyJump: los
  archivos efímeros usan una ruta privada segura cuando la solicitada tiene
  espacios. Los perfiles persistentes conservan su ubicación.
- Importador del panel Acceso bastiones con overrides, puentes, servicios, equipos,
  espacios Git y recibos contra duplicados. No ejecuta el Python ni copia contraseñas.

## Datos importados en la instalación local

Se confirmó la importación desde la UI real: **148 conexiones, 37 carpetas y
3 espacios Git**. La base contiene **149 conexiones** al conservar la conexión
que ya existía. Integridad SQLite: `ok`; un recibo de importación registrado.

Antes de importar se creó una copia consistente mediante SQLite Backup en
`native/build/backups/ori-antes-importacion-20261115-181553.sqlite` (directorio
0700, archivo 0600; ignorado por Git). Los archivos originales no se modifican.
Maqueta se reubicó en la carpeta local existente y la UI detectó siete repositorios.
Planta y LAB conservan sus rutas originales hasta seleccionar sus equivalentes macOS.

La reorganización posterior deja las raíces PRE, PRO y Maqueta. ALC1, ALC2 y
Manuel Tobar están en PRE/Bastiones; MDE, BTB y los demás centros, en PRO/Bastiones.
Execution y STF quedan bajo Maqueta. Se muestran 145 destinos en Conexiones y
cuatro perfiles centrales en Túneles. Los 149 IDs y todas las rutas SSH se
conservan sin cambios, incluidas las ediciones realizadas durante esta sesión.

Antes de aplicar el catálogo se creó otra copia consistente en
`native/build/backups/ori-antes-catalogo-20261115-191122.sqlite` con los mismos
permisos privados. La comparación readonly confirma preferencias e historial
previo intactos; solo cambia la revisión de configuración en metadata.

## Validación

- Suite Swift completa con pruebas nuevas de persistencia, JSON anterior,
  organización, rutas/ciclos, VPN inferida, importación real y Git local real.
- La prueba Git crea un remoto bare y clones temporales: fetch detecta un commit
  pendiente, pull actualiza el archivo, se rechazan cambios locales y divergencias.
  No se ejecutaron fetch/pull sobre repositorios corporativos.
- Importación del inventario real validada primero en memoria y después confirmada
  desde la app; sin conexiones SSH ni sondas a destinos corporativos.
- Revisión visual de paletas, árbol, filas y diagrama en la ventana real.
  Execution desplegado con seis equipos, catálogo de cuatro saltos y siete
  repositorios locales con rama, estado e iconos; editor de salto abierto y cancelado.
- Formato Swift estricto y compilación Release con firma ad hoc.

Los resultados finales y el alcance de las pruebas se añaden al plan de pruebas.

## Pendiente en el entorno del usuario

- Validar Ivanti conectado/desconectado con los perfiles corporativos reales.
  La inferencia no equivale a verificar el nombre del perfil activo.
- Reubicar Planta y LAB y permitir la tarea de Claude en VS Code si este lo solicita.
- Recorrido completo de drag/drop mediante interacción y revisión con VoiceOver.
- Las integraciones SSH con Docker no se repiten: OrbStack no está en ejecución.

## Commits propuestos, no ejecutados

1. `Mejora las conexiones con organización y diagrama interactivo`
2. `Amplía la detección VPN con servicios dinámicos e interfaces asociadas`
3. `Añade repositorios Git e importación de Acceso bastiones`
4. `Organiza PRE y PRO y centraliza los saltos en Túneles`
5. `Compacta repositorios y corrige ProxyJump con rutas con espacios`
