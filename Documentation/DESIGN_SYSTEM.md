# Sistema visual

Actualización 2026-11-15: Conexiones se presenta en filas y cada sección tiene
una paleta propia, más luminosa y variada. El diagrama usa Canvas para líneas y
vistas SwiftUI accesibles para nodos, con selección, zoom, posiciones persistidas
y drag/drop de bastiones.

La aplicación usa SwiftUI, NavigationSplitView, controles macOS y SwiftTerm/AppKit.
La inspiración de CleanMyMac se limita a una dirección de color y composición:
no se han copiado marca, ilustraciones ni iconos propietarios. El icono de bundle
procede de los recursos existentes de ORI y la UI utiliza SF Symbols.

## Tokens

`native/Sources/ORIApp/DesignSystem/DesignSystem.swift` centraliza colores semánticos,
jerarquía tipográfica, espaciado, radios y colores de estado. `SectionPalette` se
propaga mediante Environment de SwiftUI, sin estado global mutable. Cambia al
navegar: fondo, barra lateral, selección, paneles, cabecera, controles y botones.
Los NSColor dinámicos tienen variantes clara/oscura; Ajustes permite claro,
oscuro o sistema. Las preferencias del emulador de terminal son independientes.

| Sección | Paleta |
|---|---|
| Inicio | Cian |
| Conexiones | Verde |
| Terminales | Violeta |
| Túneles | Azul |
| Repositorios | Naranja |
| Workspaces | Rosa |
| Diagnósticos | Coral |
| Ajustes | Azul grisáceo |

Los colores guardados de cada perfil se conservan, con variantes distinguibles
para azul, cian, verde, naranja, amarillo, rojo, rosa y violeta. Los estados de
conexión mantienen sus colores semánticos. El botón principal usa un tono más
oscuro de la sección con texto blanco.
No se afirma una certificación WCAG completa sin medir todos los estados.

## Jerarquía y componentes

- Tipografía nativa; títulos redondeados de 30 pt, secciones de 19 pt y monoespaciada
  para rutas, endpoints y salida técnica.
- Espaciado principal 20 pt, márgenes de página 28–30 pt y tarjetas de radio 20 pt.
- HostRowsView usa cabecera fija y filas alternas con nombre, estado, destino,
  usuario, recorrido y acciones. Oculta columnas secundarias en ventanas estrechas.
  Conserva drag/drop, carpetas y el diagrama. Favoritos, conexión y menú se comparten
  con las tarjetas del Inicio para mantener las mismas acciones.
- Las carpetas de Conexiones se presentan en un árbol desplegable: PRE y PRO
  contienen Bastiones y servicios; Maqueta contiene Execution y STF. ALC y MMT
  se clasifican en PRE; los demás centros, como MDE y BTB, en PRO.
- Túneles incorpora el catálogo de máquinas de salto. Conexiones selecciona sus
  perfiles por referencia y el editor central actualiza todos los usos.
- Repositorios usa una fila por proyecto: nombre, rama, icono de estado y acciones
  de Finder, Claude Code en consola, VS Code, fetch y pull. Rutas, recuentos y
  detalles están en las ayudas de los iconos. Claude en VS Code queda en el menú.
- Card, StatusBadge, PageHeader, EmptyPanel y PrimaryButtonStyle se reutilizan
  entre secciones.
- Estados incluyen texto además de color; Unknown nunca se pinta como Connected.
- Los colores/iconos históricos se conservan y los nombres Lucide conocidos se
  resuelven a equivalentes SF Symbols sin incluir una segunda biblioteca de iconos.

## Pantallas

Inicio muestra recuentos reales, favoritos y actividad. Conexiones incluye filas,
búsqueda, carpetas/etiquetas, edición y recorrido lógico. Terminales muestra pestañas
propietarias, búsqueda, acciones y comandos. Túneles separa autenticación, reenvío
y servicio. Workspaces agrupa
recursos. Diagnósticos separa registros locales de informes redactados. Ajustes
persiste preferencias y expone importación/exportación.

La terminal es una superficie opaca uniforme, con tema oscuro o claro legible;
no recibe gradientes ni animaciones de navegación internas. SwiftTerm se ocupa
 de selección, cursor, scrollback, resize y semántica ANSI/Unicode.

## Accesibilidad y movimiento

NavigationSplitView, List, Form, Picker y botones conservan la semántica nativa.
Botones solo con icono tienen etiquetas accesibles. Se incluyen identificadores
para navegación y terminal, tamaños mínimos de ventana y atajos ⌘N, ⌘K, ⌘0, ⌘,.
La transición de navegación respeta accessibilityReduceMotion. No se aplican
animaciones de alta frecuencia a las terminales.

Se revisan las filas y los cambios de sección en la app real con el inventario
importado. Siguen pendientes VoiceOver de extremo a extremo, contraste medido
de todos los elementos y revisión exhaustiva de foco y tamaños.

VPN e Ivanti se retiraron de navegación, dashboard, formularios y diagrama.
Los perfiles SSH incorporan un SecureField y un indicador de contraseña guardada.
Exportar solicita una contraseña propia del archivo y su repetición.

## Cabecera y árbol de Conexiones

La ventana utiliza título oculto y fondo continuo en la barra superior, sin el
selector global de entornos ni acciones duplicadas. Conexiones agrupa título,
vista y alta en una fila; búsqueda, filtros e importación/exportación en otra.
La selección de workspaces permanece dentro de Workspaces; el árbol de
Conexiones muestra todo el catálogo de destinos sin filtros globales ocultos.

Cada carpeta tiene una fila de ancho completo con contador de descendientes.
La flecha despliega subcarpetas; ambos controles seleccionan la carpeta.
Los servidores aparecen a la derecha. Seleccionar una carpeta limpia búsqueda,
etiquetas y favoritos y vuelve a Filas para mostrar todo su contenido.
Clic derecho ofrece subcarpeta, carpeta hermana, carpeta superior y edición
con movimiento. Insertar una superior envuelve la carpeta conservando IDs,
servidores y rutas. El editor de movimiento excluye la propia rama para evitar ciclos.
