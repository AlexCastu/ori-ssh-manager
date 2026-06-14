import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, ChevronDown, Unplug, XCircle, CopyX, Network } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { sshService } from '../hooks/sshService';
import { AnchoredMenu } from './AnchoredMenu';

export function TabBar() {
  const { tabs, activeTabId, sessions, setActiveTab, closeTab, openInfoModal } = useStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      sessions: s.sessions,
      setActiveTab: s.setActiveTab,
      closeTab: s.closeTab,
      openInfoModal: s.openInfoModal,
    }))
  );

  // Selector desplegable con TODAS las pestañas: con muchas sesiones la tira
  // hace scroll horizontal y este menú es la forma rápida de saltar entre ellas
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  // Menú contextual (clic derecho) sobre una pestaña
  const [ctxMenu, setCtxMenu] = useState<{ anchor: DOMRect; tabId: string } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const closeMany = async (ids: string[]) => {
    for (const id of ids) {
      await closeTab(id);
    }
  };

  // La pestaña activa siempre visible aunque la tira tenga scroll
  useEffect(() => {
    if (!activeTabId) return;
    stripRef.current
      ?.querySelector(`[data-tab-id="${CSS.escape(activeTabId)}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTabId]);

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
    <div className="flex items-center bg-white/70 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-white/5">
      <div
        ref={stripRef}
        className="flex-1 min-w-0 flex items-center gap-1 px-2 py-1 overflow-x-auto scrollbar-hide"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const session = getSessionForTab(tab.sessionId);
            const isActive = tab.id === activeTabId;

            return (
              <motion.button
                key={tab.id}
                layout
                data-tab-id={tab.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                title={session ? `${session.name} — ${session.username}@${session.host}:${session.port}` : 'Unknown'}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // Ancla en el puntero: DOMRect de tamaño 0 en la posición del clic
                  setCtxMenu({
                    anchor: new DOMRect(e.clientX, e.clientY, 0, 0),
                    tabId: tab.id,
                  });
                }}
                className={`
                  group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                  transition-colors min-w-[120px] max-w-[200px] shrink-0
                  ${isActive
                    ? 'bg-zinc-900/10 dark:bg-white/10 text-zinc-900 dark:text-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/5 dark:hover:bg-white/5'
                  }
                `}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot(tab.status)}`} />
                <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate flex-1 text-left">
                  {session?.name || 'Unknown'}
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-900/10 dark:hover:bg-white/10 transition-all"
                >
                  <X className="w-3 h-3" />
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Botón "N ▾": lista vertical de todas las pestañas */}
      {tabs.length > 1 && (
        <button
          onClick={(e) =>
            setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect())
          }
          className="shrink-0 mx-1 px-1.5 py-1 rounded-lg flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/5 dark:hover:bg-white/5 transition-colors"
          title="Todas las pestañas"
        >
          <span className="tabular-nums">{tabs.length}</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}

      {menuAnchor && (
        <AnchoredMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          className="py-1 min-w-[230px] max-h-[60vh] overflow-y-auto"
        >
          {tabs.map((tab) => {
            const session = getSessionForTab(tab.sessionId);
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                title={session ? `${session.name} — ${session.username}@${session.host}:${session.port}` : 'Unknown'}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMenuAnchor(null);
                }}
                className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                  isActive
                    ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(tab.status)}`} />
                <span className="truncate flex-1">{session?.name || 'Unknown'}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="p-0.5 rounded text-zinc-500 hover:text-red-500 hover:bg-zinc-300/60 dark:hover:bg-zinc-600"
                  title="Cerrar"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </AnchoredMenu>
      )}

      {ctxMenu && (() => {
        const ctxTab = tabs.find((t) => t.id === ctxMenu.tabId);
        if (!ctxTab) return null;
        const itemBase =
          'w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 disabled:opacity-40';
        const itemClass = `${itemBase} text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700`;
        const itemDanger = `${itemBase} text-red-600 dark:text-red-400 hover:bg-red-500/10`;
        const isConnected = ctxTab.status === 'connected' && ctxTab.channelId;
        const ctxSession = getSessionForTab(ctxTab.sessionId);
        return (
          <AnchoredMenu
            anchor={ctxMenu.anchor}
            align="left"
            onClose={() => setCtxMenu(null)}
            className="py-1 min-w-[180px]"
          >
            {ctxSession && (
              <button
                onClick={() => {
                  openInfoModal({ session: ctxSession });
                  setCtxMenu(null);
                }}
                className={itemClass}
              >
                <Network className="w-3.5 h-3.5" />
                Información / Mapa
              </button>
            )}
            {isConnected && (
              <button
                onClick={() => {
                  if (ctxTab.channelId) {
                    sshService.disconnect(ctxTab.id, ctxTab.channelId);
                  }
                  setCtxMenu(null);
                }}
                className={itemClass}
              >
                <Unplug className="w-3.5 h-3.5" />
                Desconectar
              </button>
            )}
            <button
              onClick={() => {
                closeMany([ctxTab.id]);
                setCtxMenu(null);
              }}
              className={itemClass}
            >
              <X className="w-3.5 h-3.5" />
              Cerrar pestaña
            </button>
            <button
              disabled={tabs.length < 2}
              onClick={() => {
                closeMany(tabs.filter((t) => t.id !== ctxTab.id).map((t) => t.id));
                setCtxMenu(null);
              }}
              className={itemClass}
            >
              <CopyX className="w-3.5 h-3.5" />
              Cerrar las demás
            </button>
            <button
              onClick={() => {
                closeMany(tabs.map((t) => t.id));
                setCtxMenu(null);
              }}
              className={itemDanger}
            >
              <XCircle className="w-3.5 h-3.5" />
              Cerrar todas
            </button>
          </AnchoredMenu>
        );
      })()}
    </div>
  );
}
