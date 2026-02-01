import { useEffect } from 'react';
import { Terminal, Circle } from 'lucide-react';
import { useStore } from './store/useStore';
import { useTheme } from './contexts/ThemeContext';
import { sshService } from './hooks/sshService';
import {
  Sidebar,
  SessionModal,
  TerminalView,
  TabBar,
  CommandPanel,
  CommandModal,
  ToastContainer,
} from './components';
import { SettingsModal } from './components/SettingsModal';

function App() {
  const { isInitialized, initialize, tabs, activeTabId } = useStore();
  const { isDark } = useTheme();

  useEffect(() => {
    sshService.initialize();
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    return (
      <div className={`h-screen flex items-center justify-center gradient-mesh ${isDark ? 'text-white' : 'text-zinc-900'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
            isDark
              ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)]/20'
              : 'bg-[var(--accent-subtle)] border-[var(--accent-primary)]/20'
          }`}>
            <Terminal className={`w-6 h-6 animate-pulse`} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">Cargando ORI-SSHManager...</p>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const connectedCount = tabs.filter((t) => t.status === 'connected').length;

  return (
    <div className={`h-screen flex flex-col gradient-mesh overflow-hidden ${isDark ? 'text-white' : 'text-zinc-900'}`}>
      {/* Main content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <TabBar />
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              {activeTab ? (
                <TerminalView key={activeTab.id} tabId={activeTab.id} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 border ${
                      isDark
                        ? 'bg-[var(--bg-tertiary)] border-[var(--border-secondary)]'
                        : 'bg-[var(--bg-tertiary)] border-[var(--border-secondary)]'
                    }`}>
                      <Terminal className="w-8 h-8 text-[var(--text-tertiary)]" />
                    </div>
                    <h2 className="text-lg font-medium mb-2 text-[var(--text-primary)]">
                      Sin Sesión Activa
                    </h2>
                    <p className="text-sm max-w-xs text-[var(--text-secondary)]">
                      Selecciona una sesión del panel lateral y haz clic en el botón de play para iniciar una nueva sesión de terminal
                    </p>
                  </div>
                </div>
              )}
            </div>
            <CommandPanel />
          </div>
        </div>
      </div>

      {/* Footer global - abarca todo el ancho */}
      <div className="px-3 py-1 border-t text-xs flex items-center gap-4 bg-[var(--bg-secondary)] border-[var(--border-primary)] shrink-0">
        <Circle
          className={`w-2 h-2 shrink-0 ${
            activeTab?.status === 'connected' ? 'text-[var(--success)]' :
            activeTab?.status === 'connecting' ? 'text-[var(--warning)] animate-pulse' :
            activeTab?.status === 'error' ? 'text-[var(--error)]' :
            'text-[var(--text-tertiary)]'
          }`}
          fill="currentColor"
        />
        <span className="text-[var(--text-secondary)]">
          {activeTab?.status === 'connected' ? 'Conectado' :
           activeTab?.status === 'connecting' ? 'Conectando...' :
           activeTab?.status === 'error' ? 'Error' :
           activeTab ? 'Desconectado' : 'Sin sesión'}
        </span>
        {activeTab?.channelId && (
          <span
            className="font-mono text-[10px] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 px-1 rounded"
            title={`Channel ID: ${activeTab.channelId}`}
          >
            #{activeTab.channelId.slice(0, 8)}
          </span>
        )}
        {activeTab && (
          <>
            <span className="text-[var(--text-quaternary)]">•</span>
            <span className="text-[var(--text-primary)]">{activeTab.title}</span>
          </>
        )}
        <div className="flex-1" />
        <span className="text-[var(--text-tertiary)]">{connectedCount}/{tabs.length}</span>
        <span className="text-[var(--text-quaternary)]">v1.0</span>
      </div>

      <SessionModal />
      <CommandModal />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
}

export default App;
