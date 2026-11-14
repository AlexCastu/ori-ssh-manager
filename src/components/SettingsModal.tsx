import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Moon, Sun, Palette, Type, TerminalSquare, History, ScrollText } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import type { TerminalTheme, TerminalFontSize, TerminalCursorStyle, TerminalScrollback } from '../types';

const terminalThemes: { id: TerminalTheme; name: string; icon: typeof Moon; preview: { bg: string; fg: string } }[] = [
  {
    id: 'nord-dark',
    name: 'Nord oscuro',
    icon: Moon,
    preview: { bg: '#2e3440', fg: '#eceff4' },
  },
  {
    id: 'nord-light',
    name: 'Nord claro',
    icon: Sun,
    preview: { bg: '#eceff4', fg: '#2e3440' },
  },
];

const terminalFontSizes: { id: TerminalFontSize; name: string; description: string; preview: string }[] = [
  {
    id: 'small',
    name: 'Pequeña',
    description: 'Más líneas, texto compacto',
    preview: '12px',
  },
  {
    id: 'medium',
    name: 'Mediana',
    description: 'Lectura equilibrada',
    preview: '14px',
  },
  {
    id: 'large',
    name: 'Grande',
    description: 'Texto grande y cómodo',
    preview: '16px',
  },
];

const cursorStyles: { id: TerminalCursorStyle; name: string; preview: string }[] = [
  { id: 'block', name: 'Bloque', preview: '█' },
  { id: 'bar', name: 'Barra', preview: '▏' },
  { id: 'underline', name: 'Subrayado', preview: '▁' },
];

const scrollbackOptions: { id: TerminalScrollback; name: string; description: string }[] = [
  { id: 1000, name: '1K', description: 'Ligero, poca memoria' },
  { id: 10000, name: '10K', description: 'Equilibrado (por defecto)' },
  { id: 50000, name: '50K', description: 'Historial largo, más memoria' },
];

export function SettingsModal() {
  const { settingsModal, closeSettingsModal, settings, updateSettings } = useStore(
    useShallow((s) => ({
      settingsModal: s.settingsModal,
      closeSettingsModal: s.closeSettingsModal,
      settings: s.settings,
      updateSettings: s.updateSettings,
    }))
  );
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion).catch((error) => {
      console.error('Failed to load app version:', error);
    });
  }, []);

  if (!settingsModal.isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={closeSettingsModal}
      >
        <motion.div
          initial={{ scale: 0.97, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.97, opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="modal-cristal w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 text-texto"
        >
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-acento to-acento-2">
                <Monitor className="h-5 w-5 text-texto" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-texto">Ajustes</h2>
                <p className="text-sm text-texto-suave">Personaliza tu experiencia</p>
              </div>
            </div>
            <button
              onClick={closeSettingsModal}
              className="btn-icono"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Two-column layout: minimizes vertical scrolling */}
          <div className="grid grid-cols-2 gap-x-8">
          {/* Left column */}
          <div>
          {/* Terminal Theme Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-texto-tenue">
              <Palette className="h-4 w-4" />
              <span>Tema del terminal</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {terminalThemes.map((theme) => {
                const isSelected = settings.terminalTheme === theme.id;
                const Icon = theme.icon;

                return (
                  <button
                    key={theme.id}
                    onClick={() => updateSettings({ terminalTheme: theme.id })}
                    className={`tarjeta group relative flex flex-col items-center gap-3 p-4 transition-all ${
                      isSelected
                        ? 'border-acento bg-superficie-fuerte'
                        : 'hover:border-borde-fuerte hover:bg-superficie-hover'
                    }`}
                  >
                    {/* Theme Preview */}
                    <div
                      className="flex h-14 w-full items-center justify-center rounded-xl border border-borde"
                      style={{ backgroundColor: theme.preview.bg }}
                    >
                      <div className="font-mono text-xs" style={{ color: theme.preview.fg }}>
                        $ ssh usuario@servidor
                      </div>
                    </div>

                    {/* Theme Info */}
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-acento' : 'text-texto-suave'}`} />
                      <span className={`text-sm font-medium ${isSelected ? 'text-texto' : 'text-texto-suave'}`}>
                        {theme.name}
                      </span>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <motion.div
                        layoutId="terminal-theme-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-2xl bg-acento"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Terminal Theme Colors Preview */}
          <div className="tarjeta mt-4 bg-hundido p-4">
            <div className="mb-2 text-xs font-medium text-texto-suave">Vista previa de colores del terminal</div>
            <div
              className="rounded-xl p-3 font-mono text-xs"
              style={{
                backgroundColor: settings.terminalTheme === 'nord-dark' ? '#2e3440' : '#eceff4',
                color: settings.terminalTheme === 'nord-dark' ? '#eceff4' : '#2e3440',
              }}
            >
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#88c0d0' : '#5e81ac' }}>
                → Conectado al servidor
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#a3be8c' : '#8fbcbb' }}>
                ✓ Autenticación correcta
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#ebcb8b' : '#d08770' }}>
                ⚠ Aviso: 3 actualizaciones disponibles
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#bf616a' : '#bf616a' }}>
                ✗ Error: Tiempo de conexión agotado
              </div>
            </div>
          </div>

          </div>

          {/* Right column */}
          <div>
          {/* Terminal Font Size */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-texto-tenue">
              <Type className="h-4 w-4" />
              <span>Tamaño de fuente del terminal</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {terminalFontSizes.map((size) => {
                const selectedSize = settings.terminalFontSize ?? 'medium';
                const isSelected = selectedSize === size.id;

                return (
                  <button
                    key={size.id}
                    onClick={() => updateSettings({ terminalFontSize: size.id })}
                    className={`tarjeta group relative flex flex-col items-start gap-1 p-3 text-left transition-all ${
                      isSelected
                        ? 'border-acento bg-superficie-fuerte'
                        : 'hover:border-borde-fuerte hover:bg-superficie-hover'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className={`text-sm font-medium ${isSelected ? 'text-texto' : 'text-texto-suave'}`}>
                        {size.name}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isSelected
                          ? 'bg-superficie-fuerte text-acento'
                          : 'bg-superficie text-texto-suave'
                      }`}
                      >
                        {size.preview}
                      </span>
                    </div>
                    <div className="text-xs text-texto-suave">
                      {size.description}
                    </div>

                    {isSelected && (
                      <motion.div
                        layoutId="terminal-font-size-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-2xl bg-acento"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cursor Style */}
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-texto-tenue">
              <TerminalSquare className="h-4 w-4" />
              <span>Estilo del cursor</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {cursorStyles.map((style) => {
                const isSelected = (settings.cursorStyle ?? 'block') === style.id;

                return (
                  <button
                    key={style.id}
                    onClick={() => updateSettings({ cursorStyle: style.id })}
                    className={`tarjeta group relative flex flex-col items-center gap-2 p-3 transition-all ${
                      isSelected
                        ? 'border-acento bg-superficie-fuerte'
                        : 'hover:border-borde-fuerte hover:bg-superficie-hover'
                    }`}
                  >
                    <span className={`font-mono text-base leading-none ${isSelected ? 'text-acento' : 'text-texto-suave'}`}>
                      {style.preview}
                    </span>
                    <span className={`text-xs font-medium ${isSelected ? 'text-texto' : 'text-texto-suave'}`}>
                      {style.name}
                    </span>

                    {isSelected && (
                      <motion.div
                        layoutId="cursor-style-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-2xl bg-acento"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollback */}
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-texto-tenue">
              <History className="h-4 w-4" />
              <span>Historial de desplazamiento</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {scrollbackOptions.map((option) => {
                const isSelected = (settings.scrollback ?? 10000) === option.id;

                return (
                  <button
                    key={option.id}
                    onClick={() => updateSettings({ scrollback: option.id })}
                    className={`tarjeta group relative flex flex-col items-start gap-1 p-3 text-left transition-all ${
                      isSelected
                        ? 'border-acento bg-superficie-fuerte'
                        : 'hover:border-borde-fuerte hover:bg-superficie-hover'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isSelected ? 'text-texto' : 'text-texto-suave'}`}>
                      {option.name} líneas
                    </span>
                    <span className="text-xs text-texto-suave">
                      {option.description}
                    </span>

                    {isSelected && (
                      <motion.div
                        layoutId="scrollback-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-2xl bg-acento"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audit log */}
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-texto-tenue">
              <ScrollText className="h-4 w-4" />
              <span>Registro de auditoría</span>
            </div>

            <button
              onClick={() => updateSettings({ logCommands: !(settings.logCommands ?? false) })}
              className="tarjeta flex w-full items-center justify-between p-3 text-left transition-all hover:border-borde-fuerte"
            >
              <div className="flex flex-col gap-0.5 pr-3">
                <span className="text-sm font-medium text-texto">
                  Registrar comandos lanzados
                </span>
                <span className="text-xs text-texto-suave">
                  Si lo activas, guarda SIN cifrar cada línea que envíes con Enter.
                  Se omite lo escrito tras un prompt de contraseña, pero no tras
                  otros (PIN, tokens, códigos) ni los secretos dentro del comando.
                  Los eventos de conexión se registran siempre.
                </span>
              </div>
              <span
                className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                  (settings.logCommands ?? false) ? 'bg-gradient-to-br from-acento to-acento-2' : 'bg-superficie-fuerte'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-texto shadow transition-transform ${
                    (settings.logCommands ?? false) ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          </div>

          </div>
          </div>

          {/* Version Info */}
          <div className="mt-6 flex items-center justify-between border-t border-borde pt-4">
            <span className="text-xs text-texto-tenue">ORI-SSHManager{version && ` v${version}`}</span>
            <span className="text-xs text-texto-tenue">Alex Constantin Castu ❤️</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
