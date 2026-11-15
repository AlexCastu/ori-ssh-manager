# ORI-SSHManager v1.0.0

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.9.5-24C8D8?logo=tauri)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)

Gestor de sesiones SSH con interfaz moderna construido con **Tauri 2 + React + TypeScript**.

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Desarrollo](#-desarrollo)
- [Compilación](#-compilación)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Uso](#-uso)
- [Configuración](#-configuración)
- [Contribuir](#-contribuir)

---

## ✨ Características

- 🌍 **Múltiples Entornos**: Gestiona diferentes entornos (DEV, PRE, PRO) con rutas independientes
- 🎨 **Temas Dinámicos**: Colores e iconos personalizables por entorno
- 📦 **Operaciones Git**:
  - Clone de repositorios
  - Pull, Fetch y Git Config por proyecto
  - **Pull All**: Actualiza todos los proyectos de un entorno a la vez
- ⚙️ **Variables Git Globales**: Gestión completa de configuración git --global (proxy, credenciales, etc.)
- ⭐ **Favoritos**: Marca proyectos favoritos con notas personalizadas
- 🔍 **Búsqueda y Filtros**: Encuentra proyectos rápidamente
- 🚀 **Integración IDE**: Abre proyectos directamente en tu editor favorito (VS Code, Cursor, etc.)
- 📊 **Estado Git en Tiempo Real**: Ver ahead/behind, branch actual y cambios pendientes
- 💾 **Persistencia**: Configuración guardada en `%APPDATA%\ORI-RepoManager\config.json`

---

## 🔧 Requisitos Previos

### Para Desarrollo

1. **Node.js** (v18 o superior)
   - Descargar: https://nodejs.org/

2. **Rust** (última versión estable)
   ```powershell
   # Instalar con rustup (recomendado)
   winget install Rustlang.Rustup
   # O descargar desde: https://rustup.rs/
   ```

3. **Tauri CLI**
   ```powershell
   cargo install tauri-cli --version "^2.0.0"
   ```

4. **Git** (debe estar en el PATH del sistema)
   ```powershell
   git --version  # Verificar instalación
   ```

### Para Compilación (Windows)

- **Visual Studio Build Tools** o **Visual Studio 2019/2022**
  - Componente requerido: "Desarrollo para el escritorio con C++"
  - Descargar: https://visualstudio.microsoft.com/downloads/

---

## 📥 Instalación

### 1. Clonar el Repositorio

```powershell
git clone https://github.com/AlexCastu/ori-repo-manager.git
cd ori-repo-manager
```

### 2. Instalar Dependencias

```powershell
npm install
```

---

## 🚀 Desarrollo

### Ejecutar en Modo Desarrollo

```powershell
npm run tauri dev
```

Esto iniciará:
- El servidor de desarrollo de Vite (frontend)
- La aplicación Tauri con hot-reload

### Verificar Errores de TypeScript

```powershell
npx tsc --noEmit
```

### Compilar Frontend (sin lanzar app)

```powershell
npm run build
```

---

## 📦 Compilación

### Compilar para Producción

```powershell
# Asegurarse de que Cargo está en el PATH
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Compilar
npm run tauri build
```

### Resultado de la Compilación

Los instaladores se generan en:

```
src-tauri\target\release\bundle\
├── msi\
│   └── ORI-RepoManager_2.0.0_x64_en-US.msi
└── nsis\
    └── ORI-RepoManager_2.0.0_x64-setup.exe  ← Recomendado
```

**Instalador Recomendado**: `ORI-RepoManager_2.0.0_x64-setup.exe`

### Compilar para Diferentes Plataformas

Por defecto, se compila para Windows. Para otras plataformas:

```powershell
# Linux
npm run tauri build -- --target x86_64-unknown-linux-gnu

# macOS
npm run tauri build -- --target x86_64-apple-darwin
```

---

## 📂 Estructura del Proyecto

```
ori-repo-manager/
├── src/                          # Frontend React
│   ├── components/               # Componentes React
│   │   ├── ProjectCard.tsx       # Tarjeta de proyecto (vista grid)
│   │   ├── ProjectCardCompact.tsx # Tarjeta compacta (vista lista)
│   │   ├── EnvironmentModal.tsx  # Modal crear/editar entorno
│   │   ├── GitVariablesModal.tsx # Gestor de variables git
│   │   ├── DeleteEnvironmentModal.tsx
│   │   ├── GitCloneModal.tsx
│   │   ├── GitPullModal.tsx
│   │   └── ...
│   ├── store/                    # Zustand store (estado global)
│   │   └── useStore.ts
│   ├── types/                    # Tipos TypeScript
│   │   └── index.ts
│   ├── utils/                    # Utilidades
│   │   ├── tauri.ts              # Wrappers de comandos Tauri
│   │   ├── colors.ts             # Sistema de colores por entorno
│   │   └── helpers.ts
│   ├── App.tsx                   # Componente principal
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Backend Rust (Tauri)
│   ├── src/
│   │   ├── lib.rs                # Comandos Tauri (scan, git, config, etc.)
│   │   └── main.rs               # Entry point Rust
│   ├── Cargo.toml                # Dependencias Rust
│   ├── tauri.conf.json           # Configuración Tauri
│   └── icons/                    # Iconos de la app
├── package.json                  # Dependencias npm
├── tsconfig.json                 # Config TypeScript
├── vite.config.ts                # Config Vite
└── tailwind.config.js            # Config Tailwind CSS
```

---

## 🎯 Uso

### 1. Crear un Entorno

1. Haz clic en **"Nuevo Entorno"**
2. Introduce:
   - Nombre (ej: "Desarrollo", "PRE", "PRO")
   - Ruta base (carpeta donde están tus proyectos)
   - Servidor Git (opcional)
3. Elige color e icono
4. Guarda

### 2. Escanear Proyectos

- Al seleccionar un entorno, se escanea automáticamente
- Para refrescar: clic en 🔄 junto al entorno

### 3. Operaciones Git

- **Pull**: Botón "Pull" en cada proyecto
- **Pull All**: Botón en la barra superior (actualiza todos los proyectos)
- **Clone**: Botón "Clonar Repositorio" en el entorno activo
- **Git Config**: Menú ⋮ → "Git Config" (configurar user.name y user.email por proyecto)

### 4. Variables Git Globales

1. Clic en **"Variables Git"** (sidebar)
2. Ver/editar variables de `git config --global`
3. **Proxy rápido**:
   - SOCKS5 (127.0.0.1:10443)
   - HTTP (127.0.0.1:8080)
   - Activar/desactivar con un clic

### 5. Favoritos

- ⭐ Marca proyectos como favoritos
- 📝 Añade notas personalizadas
- 🔍 Filtra por favoritos

---

## ⚙️ Configuración

### Ubicación de Configuración

**Windows**: `C:\Users\<usuario>\AppData\Roaming\ORI-RepoManager\config.json`

### Limpiar Configuración (Instalación Limpia)

Para empezar desde cero tras desinstalar:

```powershell
# Eliminar configuración guardada
Remove-Item -Recurse -Force "$env:APPDATA\ORI-RepoManager"
```

### Formato del config.json

```json
{
  "version": "2.0.0",
  "environments": [
    {
      "id": "...",
      "name": "Desarrollo",
      "basePath": "C:\\proyectos\\dev",
      "gitServer": "https://github.com",
      "color": "emerald",
      "icon": "code",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "favorites": {},
  "projectsCache": {},
  "settings": {
    "theme": "dark",
    "defaultView": "grid",
    "showFavoritesFirst": true,
    "autoScanOnStart": true
  }
}
```

---

## 🛠️ Comandos Útiles

```powershell
# Desarrollo
npm run tauri dev              # Ejecutar en desarrollo
npm run build                  # Compilar frontend
npx tsc --noEmit              # Verificar tipos TypeScript

# Producción
npm run tauri build           # Compilar instalador completo

# Git
git add -A                    # Añadir todos los cambios
git commit -m "mensaje"       # Crear commit
git push                      # Subir a GitHub

# Limpieza
Remove-Item -Recurse -Force node_modules  # Limpiar node_modules
Remove-Item -Recurse -Force dist          # Limpiar dist
Remove-Item -Recurse -Force src-tauri\target  # Limpiar builds Rust
npm install                   # Reinstalar dependencias
```

---

## 🐛 Solución de Problemas

### Error: "tauri no se reconoce como comando"

```powershell
# Añadir Cargo al PATH en la sesión actual
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# O reinstalar tauri-cli
cargo install tauri-cli --version "^2.0.0" --force
```

### Error de compilación en Windows

- Verificar que Visual Studio Build Tools esté instalado
- Componente necesario: "Desarrollo para el escritorio con C++"

### La aplicación no guarda cambios

- Verificar permisos en `%APPDATA%\ORI-RepoManager\`
- Revisar consola de desarrollador (F12) para errores

### Colores/iconos no se guardan

- **Solucionado en v2.0**: Campos `color` e `icon` añadidos al backend Rust
- Si persiste: Eliminar `%APPDATA%\ORI-RepoManager\config.json` y reiniciar

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📝 Changelog

### v2.0.0 (2026-01-09)

- ✅ Migración completa a Tauri 2
- ✅ Sistema de colores e iconos por entorno
- ✅ Modal de variables Git globales (proxy, config)
- ✅ Pull All para actualizar múltiples proyectos
- ✅ Badges de estado Git en tiempo real
- ✅ Modal separado para eliminar entornos
- ✅ Cambio de "VS Code" a "IDE" genérico
- ✅ Corrección: Colores/iconos se persisten correctamente
- ✅ Corrección: Scroll en modales para ventanas pequeñas

---

## 👨‍💻 Autor

**Alex C.C.**

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---

## 🙏 Agradecimientos

- [Tauri](https://tauri.app/) - Framework para aplicaciones de escritorio
- [React](https://react.dev/) - Librería UI
- [Tailwind CSS](https://tailwindcss.com/) - Framework CSS
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Lucide Icons](https://lucide.dev/) - Iconos

---

## 📞 Soporte

Para reportar bugs o solicitar features, abre un issue en:
https://github.com/AlexCastu/ori-repo-manager/issues
