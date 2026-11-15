# Evolución de ORI · 2026-11-15

## Objetivo

Conexiones como punto de entrada: perfiles propios, carpetas y orden arrastrables,
recorridos editables y túneles con estado real. Repositorios integra las acciones
del panel Python existente. Paleta verde/azul en claro y oscuro.

Implementación aplicada. Los datos ya se han importado en la instalación local;
ver [entrega y límites de validación](ENTREGA-CONEXIONES.md).

## Plan de implementación

1. VPN: combinar servicios públicos persistentes y dinámicos, observar cambios
   de interfaces y mostrar inferencias separadas de identidad confirmada.
2. Conexiones: usar filas, conservar el editor SSH y añadir organización persistente por
   drag/drop y un lienzo con nodos móviles. Soltar bastiones sobre la ruta permite
   insertarlos/reordenarlos; guardar valida referencias y ciclos antes de persistir.
3. Túneles: mostrar sus listeners y destinos en el recorrido, con acciones de
   inicio/parada, y mantener el editor L/R/SOCKS existente.
4. Repositorios: raíces seleccionables, exploración acotada, estado Git local,
   upstream/ahead/behind, fetch, pull --ff-only y abrir VS Code/Claude.
5. Acceso bastiones: importación revisable de datos.json y archivos complementarios,
   incluyendo overrides, puentes, servicios y raíces Git. Sin ejecutar el Python
   ni trasladar sus contraseñas. Rutas Windows requieren selección local en macOS.
6. Pruebas: compatibilidad de SQLite/JSON existentes, organización, rutas inválidas,
   detección inferida VPN, importación y Git real en repositorios temporales.
   Compilar Debug, ejecutar suite Swift, empaquetar Release y verificar firma.

## Decisiones técnicas

- SwiftUI Canvas para líneas, vistas accesibles para nodos y DragGesture para
  posiciones. draggable/dropDestination para ordenar y construir rutas.
- Modelos de organización y raíces opcionales en metadata: las bases antiguas
  siguen decodificando, sin reescribir IDs ni credenciales.
- OpenSSH conserva la autoridad sobre el recorrido y procesos de túneles.
- Git se ejecuta con argumentos separados, sin interpolar una shell.
- La presencia de utun nunca confirma por sí sola Ivanti ni un perfil.
- Sin commits ni operaciones Git remotas sobre repositorios reales durante QA.

## Referencias primarias consultadas

- https://developer.apple.com/documentation/swiftui/adopting-drag-and-drop-using-swiftui
- https://developer.apple.com/documentation/swiftui/canvas
- https://developer.apple.com/documentation/systemconfiguration/scdynamicstorecopyvalue(_:_:)
- https://docs.ivanti.com/enu/client/mac/use-the-ivanti-secure-access-client-tray-icon-and-view-connection-status
- https://code.visualstudio.com/docs/configure/command-line
- https://git-scm.com/docs/git-status
- https://git-scm.com/docs/git-pull
