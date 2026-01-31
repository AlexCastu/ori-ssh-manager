import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';

export function TabBar() {
  const { tabs, activeTabId, sessions, setActiveTab, closeTab } = useStore();
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

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-1 border-b overflow-x-auto ${
      isDark
        ? 'bg-[var(--bg-secondary)] border-[var(--border-secondary)]'
        : 'bg-[var(--bg-secondary)] border-[var(--border-secondary)]'
    }`}>
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => {
          const session = getSessionForTab(tab.sessionId);
          const isActive = tab.id === activeTabId;

          return (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setActiveTab(tab.id)}
              className={`
                group flex items-center gap-2 px-2 py-1 rounded-lg text-sm cursor-pointer
                transition-colors min-w-[100px] max-w-[180px]
                ${isActive
                  ? isDark
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : isDark
                    ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }
              `}
            >
              <div className={`w-2 h-2 rounded-full ${statusDot(tab.status)}`} />
              <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate flex-1 text-left">
                {session?.name || 'Desconocido'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all ${
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
  );
}
