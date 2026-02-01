import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Settings, Command, Monitor } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';

export function TabBar() {
  const { tabs, activeTabId, sessions, setActiveTab, closeTab, openSettingsModal, toggleCommandPanel, commandPanelCollapsed, createLocalTab } = useStore();
  const { isDark } = useTheme();

  const getSessionForTab = (sessionId: string) => {
    return sessions.find((s) => s.id === sessionId);
  };

  const statusDot = (status: string) => {
    const colors = {
      idle: 'bg-[var(--text-tertiary)]',
      connecting: 'bg-[var(--warning)] animate-pulse',
      connected: 'bg-[var(--success)]',
      disconnected: 'bg-[var(--text-tertiary)]',
      error: 'bg-[var(--error)]',
    };
    return colors[status as keyof typeof colors] || colors.idle;
  };

  return (
    <div className={`flex items-center justify-between px-2 py-1.5 border-b ${
      isDark
        ? 'bg-[var(--bg-secondary)] border-[var(--border-secondary)]'
        : 'bg-[var(--bg-secondary)] border-[var(--border-secondary)]'
    }`}>
      {/* Lado izquierdo: Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1">
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const session = getSessionForTab(tab.sessionId);
            const isActive = tab.id === activeTabId;
            const tabLabel = tab.kind === 'local' ? 'Local' : (session?.name || 'Desconocido');

            return (
              <motion.div
                key={tab.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm cursor-pointer
                  transition-colors min-w-[110px] max-w-[200px] border
                  ${isActive
                    ? isDark
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border-primary)] shadow-sm'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border-primary)] shadow-sm'
                    : isDark
                      ? 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                      : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }
                `}
              >
                <div className={`w-2 h-2 rounded-full ${statusDot(tab.status)}`} />
                <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate flex-1 text-left">
                  {tabLabel}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`p-0.5 rounded opacity-60 group-hover:opacity-100 transition-all ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Lado derecho: Local terminal, Command Panel toggle y Settings */}
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={() => createLocalTab()}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          title="Nueva consola local"
        >
          <Monitor className="w-4 h-4" />
        </button>
        <button
          onClick={toggleCommandPanel}
          className={`p-1.5 rounded transition-colors ${
            commandPanelCollapsed
              ? 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              : 'text-[var(--accent-primary)] bg-[var(--accent-subtle)]'
          } hover:bg-[var(--bg-hover)]`}
          title={commandPanelCollapsed ? 'Mostrar Comandos' : 'Ocultar Comandos'}
        >
          <Command className="w-4 h-4" />
        </button>
        <button
          onClick={openSettingsModal}
          className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          title="Ajustes"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
