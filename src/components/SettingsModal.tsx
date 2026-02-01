import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Moon, Sun, Palette, Eye, EyeOff, Shield, Laptop } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { TerminalTheme, AppTheme } from '../types';

const terminalThemes: { id: TerminalTheme; name: string; icon: typeof Moon; preview: { bg: string; fg: string } }[] = [
  {
    id: 'nord-dark',
    name: 'Nord Oscuro',
    icon: Moon,
    preview: { bg: '#2e3440', fg: '#eceff4' },
  },
  {
    id: 'nord-light',
    name: 'Nord Claro',
    icon: Sun,
    preview: { bg: '#eceff4', fg: '#2e3440' },
  },
];

const appThemes: { id: AppTheme; name: string; icon: typeof Moon; description: string }[] = [
  {
    id: 'light',
    name: 'Claro',
    icon: Sun,
    description: 'Fondo claro',
  },
  {
    id: 'dark',
    name: 'Oscuro',
    icon: Moon,
    description: 'Fondo oscuro',
  },
  {
    id: 'system',
    name: 'Sistema',
    icon: Laptop,
    description: 'Seguir sistema',
  },
];

export function SettingsModal() {
  const { settingsModal, closeSettingsModal, settings, updateSettings } = useStore();
  const { isDark } = useTheme();


  if (!settingsModal.isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={closeSettingsModal}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border p-6 shadow-2xl ${
            isDark
              ? 'border-[var(--border-primary)] bg-[var(--bg-elevated)]'
              : 'border-[var(--border-primary)] bg-[var(--bg-elevated)]'
          }`}
        >
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-active)]">
                <Monitor className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Configuración</h2>
                <p className="text-sm text-[var(--text-secondary)]">Personaliza tu experiencia</p>
              </div>
            </div>
            <button
              onClick={closeSettingsModal}
              className={`rounded-lg p-2 transition-colors ${
                isDark
                  ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* App Theme Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <Sun className="h-4 w-4" />
              <span>Apariencia</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {appThemes.map((theme) => {
                const isSelected = settings.appTheme === theme.id;
                const Icon = theme.icon;

                return (
                  <button
                    key={theme.id}
                    onClick={() => updateSettings({ appTheme: theme.id })}
                    className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                        : isDark
                          ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-hover)]'
                          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'}`} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                      {theme.name}
                    </span>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <motion.div
                        layoutId="app-theme-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-[var(--accent-primary)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Terminal Theme Selection */}
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <Palette className="h-4 w-4" />
              <span>Tema del Terminal</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {terminalThemes.map((theme) => {
                const isSelected = settings.terminalTheme === theme.id;
                const Icon = theme.icon;

                return (
                  <button
                    key={theme.id}
                    onClick={() => updateSettings({ terminalTheme: theme.id })}
                    className={`group relative flex flex-col items-center gap-3 rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                        : isDark
                          ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-hover)]'
                          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {/* Theme Preview */}
                    <div
                      className="flex h-14 w-full items-center justify-center rounded-lg border border-[var(--border-secondary)]"
                      style={{ backgroundColor: theme.preview.bg }}
                    >
                      <div className="font-mono text-xs" style={{ color: theme.preview.fg }}>
                        $ ssh user@host
                      </div>
                    </div>

                    {/* Theme Info */}
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'}`} />
                      <span className={`text-sm font-medium ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                        {theme.name}
                      </span>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <motion.div
                        layoutId="terminal-theme-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-[var(--accent-primary)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Terminal Theme Colors Preview */}
          <div className={`mt-4 rounded-lg border p-4 ${isDark ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'}`}>
            <div className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">Vista previa de colores</div>
            <div
              className="rounded-md p-3 font-mono text-xs"
              style={{
                backgroundColor: settings.terminalTheme === 'nord-dark' ? '#2e3440' : '#eceff4',
                color: settings.terminalTheme === 'nord-dark' ? '#eceff4' : '#2e3440',
              }}
            >
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#88c0d0' : '#5e81ac' }}>
                → Conectado al servidor
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#a3be8c' : '#8fbcbb' }}>
                ✓ Autenticación exitosa
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#ebcb8b' : '#d08770' }}>
                ⚠ Aviso: 3 actualizaciones disponibles
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#bf616a' : '#bf616a' }}>
                ✗ Error: Tiempo de conexión agotado
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <Shield className="h-4 w-4" />
              <span>Seguridad</span>
            </div>

            <div className={`rounded-lg border p-4 ${isDark ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {settings.showPasswords ? (
                    <Eye className="h-5 w-5 text-[var(--accent-primary)]" />
                  ) : (
                    <EyeOff className="h-5 w-5 text-[var(--text-secondary)]" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">Mostrar Contraseñas</div>
                    <div className="text-xs text-[var(--text-tertiary)]">Mostrar contraseñas en los formularios de sesión</div>
                  </div>
                </div>
                <button
                  onClick={() => updateSettings({ showPasswords: !settings.showPasswords })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    settings.showPasswords ? 'bg-[var(--accent-primary)]' : isDark ? 'bg-[var(--bg-hover)]' : 'bg-[var(--border-primary)]'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                      settings.showPasswords ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Version Info */}
          <div className="mt-6 flex items-center justify-between border-t border-[var(--divider)] pt-4">
            <span className="text-xs text-[var(--text-tertiary)]">ORI-SSHManager v1.0.0</span>
            <span className="text-xs text-[var(--text-tertiary)]">Alex Constantin Castu ❤️</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
