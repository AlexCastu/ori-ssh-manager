import { useEffect } from 'react';
import { Plus, Terminal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from './store/useStore';
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
  const { isInitialized, initialize, tabs, activeTabId, openSessionModal } = useStore(
    useShallow((s) => ({
      isInitialized: s.isInitialized,
      initialize: s.initialize,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      openSessionModal: s.openSessionModal,
    }))
  );

  useEffect(() => {
    sshService.initialize();
    initialize();
  }, [initialize]);

  const welcomeScreen = (
    <div className="h-full flex items-center justify-center px-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-superficie border border-borde-fuerte flex items-center justify-center mb-6">
          <Terminal className="w-10 h-10 text-texto-suave" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Sin sesión activa</h2>
        <p className="text-sm text-texto-suave">Crea una sesión para empezar a conectar.</p>
        <button
          onClick={() => openSessionModal({ mode: 'create' })}
          aria-label="Nueva sesión"
          className="btn-primario w-24 h-24 flex items-center justify-center mt-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-4 focus-visible:ring-offset-[#2b1055]"
        >
          <Plus className="w-10 h-10" />
        </button>
        <span className="mt-3 text-sm font-medium">Nueva sesión</span>
        <p className="mt-6 text-xs text-texto-tenue">
          o pulsa {navigator.userAgent.includes('Mac') ? '⌘K' : 'Ctrl+K'} para buscar una sesión
        </p>
      </div>
    </div>
  );

  if (!isInitialized) {
    return (
      <div className="h-screen flex flex-col gradient-mesh overflow-hidden text-texto">
        <TitleBar />
        <div className="flex-1 min-h-0">{welcomeScreen}</div>
        <SessionModal />
        <CommandPalette />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col gradient-mesh overflow-hidden text-texto">
      <TitleBar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar />
        {/* CommandPanel queda FUERA de esta columna: si estuviera dentro,
            la aparición del TabBar al abrir la primera pestaña lo desplazaría
            hacia abajo */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <TabBar />
          <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
              {tabs.map((tab) => (
                <TerminalView key={tab.id} tabId={tab.id} isActive={tab.id === activeTabId} />
              ))}
              {tabs.length === 0 && welcomeScreen}
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
