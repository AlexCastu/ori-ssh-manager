import { useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from './store/useStore';
import { useTheme } from './contexts/ThemeContext';
import { sshService } from './hooks/sshService';
import {
  Sidebar,
  SessionModal,
  GroupModal,
  TerminalView,
  TabBar,
  CommandPanel,
  CommandModal,
  SessionInfoModal,
  CommandPalette,
  ToastContainer,
  TitleBar,
} from './components';
import { SettingsModal } from './components/SettingsModal';

function App() {
  // Selector con useShallow: el componente solo re-renderiza si cambian
  // estos campos, no con cada actualización global del store
  const { isInitialized, initialize, tabs, activeTabId } = useStore(
    useShallow((s) => ({
      isInitialized: s.isInitialized,
      initialize: s.initialize,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
    }))
  );
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
              ? 'bg-blue-500/10 border-blue-500/20'
              : 'bg-blue-100 border-blue-200'
          }`}>
            <Terminal className={`w-6 h-6 animate-pulse ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Cargando ORI-SSHManager...</p>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className={`h-screen flex flex-col gradient-mesh overflow-hidden ${isDark ? 'text-white' : 'text-zinc-900'}`}>
      <TitleBar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar />
        {/* CommandPanel queda FUERA de esta columna: si estuviera dentro,
            la aparición del TabBar al abrir la primera pestaña lo desplazaría
            hacia abajo */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <TabBar />
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              {activeTab ? (
                <TerminalView key={activeTab.id} tabId={activeTab.id} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 border ${
                      isDark
                        ? 'bg-zinc-800/50 border-zinc-700/50'
                        : 'bg-zinc-100 border-zinc-200'
                    }`}>
                      <Terminal className={`w-8 h-8 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
                    </div>
                    <h2 className={`text-lg font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      Sin sesión activa
                    </h2>
                    <p className={`text-sm max-w-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      Selecciona una sesión en la barra lateral y pulsa el botón de play para abrir una terminal
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>
        <CommandPanel />
      </div>
      <SessionModal />
      <GroupModal />
      <CommandModal />
      <SessionInfoModal />
      <CommandPalette />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
}

export default App;
