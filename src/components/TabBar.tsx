import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X } from 'lucide-react';
import { useStore } from '../store/useStore';

export function TabBar() {
  const { tabs, activeTabId, sessions, setActiveTab, closeTab } = useStore();

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
    <div className="flex items-center gap-1 px-2 py-1 bg-zinc-900/50 border-b border-white/5 overflow-x-auto">
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
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }
              `}
            >
              <div className={`w-2 h-2 rounded-full ${statusDot(tab.status)}`} />
              <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate flex-1 text-left">
                {session?.name || 'Unknown'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
