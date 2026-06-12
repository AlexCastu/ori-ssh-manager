import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Moon, Sun, Palette, Laptop, Type, TerminalSquare, History } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { TerminalTheme, AppTheme, TerminalFontSize, TerminalCursorStyle, TerminalScrollback } from '../types';

const terminalThemes: { id: TerminalTheme; name: string; icon: typeof Moon; preview: { bg: string; fg: string } }[] = [
  {
    id: 'nord-dark',
    name: 'Nord Dark',
    icon: Moon,
    preview: { bg: '#2e3440', fg: '#eceff4' },
  },
  {
    id: 'nord-light',
    name: 'Nord Light',
    icon: Sun,
    preview: { bg: '#eceff4', fg: '#2e3440' },
  },
];

const appThemes: { id: AppTheme; name: string; icon: typeof Moon; description: string }[] = [
  {
    id: 'light',
    name: 'Light',
    icon: Sun,
    description: 'Light background',
  },
  {
    id: 'dark',
    name: 'Dark',
    icon: Moon,
    description: 'Dark background',
  },
  {
    id: 'system',
    name: 'System',
    icon: Laptop,
    description: 'Follow system',
  },
];

const terminalFontSizes: { id: TerminalFontSize; name: string; description: string; preview: string }[] = [
  {
    id: 'small',
    name: 'Small',
    description: 'More lines, compact text',
    preview: '12px',
  },
  {
    id: 'medium',
    name: 'Medium',
    description: 'Balanced readability',
    preview: '14px',
  },
  {
    id: 'large',
    name: 'Large',
    description: 'Comfortable, bigger text',
    preview: '16px',
  },
];

const cursorStyles: { id: TerminalCursorStyle; name: string; preview: string }[] = [
  { id: 'block', name: 'Block', preview: '█' },
  { id: 'bar', name: 'Bar', preview: '▏' },
  { id: 'underline', name: 'Underline', preview: '▁' },
];

const scrollbackOptions: { id: TerminalScrollback; name: string; description: string }[] = [
  { id: 1000, name: '1K', description: 'Light, low memory' },
  { id: 10000, name: '10K', description: 'Balanced (default)' },
  { id: 50000, name: '50K', description: 'Long history, more memory' },
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
          className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border p-6 shadow-2xl backdrop-blur-xl ${
            isDark
              ? 'border-white/10 bg-zinc-900/95'
              : 'border-zinc-200 bg-white/95'
          }`}
        >
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
                <Monitor className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-zinc-900'}`}>Settings</h2>
                <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Customize your experience</p>
              </div>
            </div>
            <button
              onClick={closeSettingsModal}
              className={`rounded-lg p-2 transition-colors ${
                isDark
                  ? 'text-zinc-400 hover:bg-white/10 hover:text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Two-column layout: minimizes vertical scrolling */}
          <div className="grid grid-cols-2 gap-x-8">
          {/* Left column */}
          <div>
          {/* App Theme Selection */}
          <div className="space-y-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              <Sun className="h-4 w-4" />
              <span>Appearance</span>
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
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : isDark
                          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-cyan-400' : isDark ? 'text-zinc-400' : 'text-zinc-500'}`} />
                    <span className={`text-xs font-medium ${isSelected ? (isDark ? 'text-white' : 'text-zinc-900') : isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {theme.name}
                    </span>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <motion.div
                        layoutId="app-theme-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-cyan-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Terminal Theme Selection */}
          <div className="mt-6 space-y-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              <Palette className="h-4 w-4" />
              <span>Terminal Theme</span>
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
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : isDark
                          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    {/* Theme Preview */}
                    <div
                      className="flex h-14 w-full items-center justify-center rounded-lg border border-white/10"
                      style={{ backgroundColor: theme.preview.bg }}
                    >
                      <div className="font-mono text-xs" style={{ color: theme.preview.fg }}>
                        $ ssh user@host
                      </div>
                    </div>

                    {/* Theme Info */}
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-cyan-400' : isDark ? 'text-zinc-400' : 'text-zinc-500'}`} />
                      <span className={`text-sm font-medium ${isSelected ? (isDark ? 'text-white' : 'text-zinc-900') : isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {theme.name}
                      </span>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <motion.div
                        layoutId="terminal-theme-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-cyan-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Terminal Theme Colors Preview */}
          <div className={`mt-4 rounded-lg border p-4 ${isDark ? 'border-white/10 bg-black/20' : 'border-zinc-200 bg-zinc-50'}`}>
            <div className={`mb-2 text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Terminal Color Preview</div>
            <div
              className="rounded-md p-3 font-mono text-xs"
              style={{
                backgroundColor: settings.terminalTheme === 'nord-dark' ? '#2e3440' : '#eceff4',
                color: settings.terminalTheme === 'nord-dark' ? '#eceff4' : '#2e3440',
              }}
            >
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#88c0d0' : '#5e81ac' }}>
                → Connected to server
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#a3be8c' : '#8fbcbb' }}>
                ✓ Authentication successful
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#ebcb8b' : '#d08770' }}>
                ⚠ Warning: 3 updates available
              </div>
              <div style={{ color: settings.terminalTheme === 'nord-dark' ? '#bf616a' : '#bf616a' }}>
                ✗ Error: Connection timeout
              </div>
            </div>
          </div>

          </div>

          {/* Right column */}
          <div>
          {/* Terminal Font Size */}
          <div className="space-y-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              <Type className="h-4 w-4" />
              <span>Terminal Font Size</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {terminalFontSizes.map((size) => {
                const selectedSize = settings.terminalFontSize ?? 'medium';
                const isSelected = selectedSize === size.id;

                return (
                  <button
                    key={size.id}
                    onClick={() => updateSettings({ terminalFontSize: size.id })}
                    className={`group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : isDark
                          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className={`text-sm font-medium ${isSelected ? (isDark ? 'text-white' : 'text-zinc-900') : isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {size.name}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : isDark
                            ? 'bg-white/5 text-zinc-300'
                            : 'bg-zinc-100 text-zinc-600'
                      }`}
                      >
                        {size.preview}
                      </span>
                    </div>
                    <div className={`text-xs ${isSelected ? (isDark ? 'text-zinc-300' : 'text-zinc-600') : isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {size.description}
                    </div>

                    {isSelected && (
                      <motion.div
                        layoutId="terminal-font-size-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-cyan-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cursor Style */}
          <div className="mt-6 space-y-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              <TerminalSquare className="h-4 w-4" />
              <span>Cursor Style</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {cursorStyles.map((style) => {
                const isSelected = (settings.cursorStyle ?? 'block') === style.id;

                return (
                  <button
                    key={style.id}
                    onClick={() => updateSettings({ cursorStyle: style.id })}
                    className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : isDark
                          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    <span className={`font-mono text-base leading-none ${isSelected ? 'text-cyan-400' : isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {style.preview}
                    </span>
                    <span className={`text-xs font-medium ${isSelected ? (isDark ? 'text-white' : 'text-zinc-900') : isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {style.name}
                    </span>

                    {isSelected && (
                      <motion.div
                        layoutId="cursor-style-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-cyan-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollback */}
          <div className="mt-6 space-y-4">
            <div className={`flex items-center gap-2 text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              <History className="h-4 w-4" />
              <span>Scrollback History</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {scrollbackOptions.map((option) => {
                const isSelected = (settings.scrollback ?? 10000) === option.id;

                return (
                  <button
                    key={option.id}
                    onClick={() => updateSettings({ scrollback: option.id })}
                    className={`group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : isDark
                          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isSelected ? (isDark ? 'text-white' : 'text-zinc-900') : isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {option.name} lines
                    </span>
                    <span className={`text-xs ${isSelected ? (isDark ? 'text-zinc-300' : 'text-zinc-600') : isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {option.description}
                    </span>

                    {isSelected && (
                      <motion.div
                        layoutId="scrollback-indicator"
                        className="absolute -top-px -right-px h-3 w-3 rounded-bl-lg rounded-tr-xl bg-cyan-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          </div>
          </div>

          {/* Version Info */}
          <div className={`mt-6 flex items-center justify-between border-t pt-4 ${isDark ? 'border-white/10' : 'border-zinc-200'}`}>
            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>ORI-SSHManager v1.0.0</span>
            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Alex Constantin Castu ❤️</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
