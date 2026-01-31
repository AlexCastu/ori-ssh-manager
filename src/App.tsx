import { useEffect } from 'react';
import { Terminal } from 'lucide-react';
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

  return (
    <div className={`h-screen flex gradient-mesh overflow-hidden ${isDark ? 'text-white' : 'text-zinc-900'}`}>
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
          {/* Footer */}
          <div className={`px-3 py-1.5 border-t text-xs flex items-center justify-between ${
            isDark ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-tertiary)]' : 'bg-[var(--bg-secondary)] border-[var(--border-primary)] text-[var(--text-tertiary)]'
          }`}>
            <span>ORI-SSHManager v1.0</span>
            <span>{tabs.length} {tabs.length === 1 ? 'sesión' : 'sesiones'} activa{tabs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      <SessionModal />
      <CommandModal />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
}

export default App;
