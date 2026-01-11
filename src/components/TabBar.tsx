import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { SessionColor } from '../types';

const colorDots: Record<SessionColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
  yellow: 'bg-yellow-500',
};

export function TabBar() {
  const { tabs, activeTabId, sessions, setActiveTab, closeTab } = useStore();
  const { isDark } = useTheme();

  const getSessionForTab = (sessionId: string) => {
    return sessions.find((s) => s.id === sessionId);
  };

  const statusDot = (status: string) => {
    const colors = {
      idle: 'bg-zinc-500',
      connecting: 'bg-yellow-500 animate-pulse',
      connected: 'bg-green-500',
      disconnected: 'bg-zinc-500',
      error: 'bg-red-500',
    };
    return colors[status as keyof typeof colors] || colors.idle;
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-1 border-b overflow-x-auto whitespace-nowrap transition-colors ${
      isDark
        ? 'bg-zinc-900/50 border-white/5'
        : 'bg-zinc-50 border-zinc-200'
    }`}>
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => {
          const session = getSessionForTab(tab.sessionId);
          const isActive = tab.id === activeTabId;

          return (
            <motion.button
              key={tab.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setActiveTab(tab.id)}
              className={`
                group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                transition-colors min-w-[120px] max-w-[200px]
                ${isActive
                  ? isDark ? 'bg-white/10 text-white' : 'bg-zinc-200 text-zinc-900'
                  : isDark ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }
              `}
            >
              <div className={`w-2 h-2 rounded-full ${statusDot(tab.status)}`} />
              <div
                className={`w-2.5 h-2.5 rounded-sm border ${
                  session?.color ? colorDots[session.color] : 'bg-zinc-400'
                } ${isDark ? 'border-white/20' : 'border-black/10'}`}
                title={session?.color ? `Color: ${session.color}` : 'Sin color'}
              />
              <Terminal className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`} />
              <span
                className="truncate flex-1 text-left"
                title={session?.name || 'Unknown'}
              >
                {session?.name || 'Unknown'}
              </span>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    closeTab(tab.id);
                  }
                }}
                className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-zinc-300'
                }`}
              >
                <X className="w-3 h-3" />
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
