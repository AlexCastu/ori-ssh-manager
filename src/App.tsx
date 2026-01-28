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
  TitleBar,
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
              ? 'bg-blue-500/10 border-blue-500/20'
              : 'bg-blue-100 border-blue-200'
          }`}>
            <Terminal className={`w-6 h-6 animate-pulse ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Loading ORI-SSHManager...</p>
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
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <TabBar />
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
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
                      No Active Session
                    </h2>
                    <p className={`text-sm max-w-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      Select a session from the sidebar and click the play button to start a new terminal session
                    </p>
                  </div>
                </div>
              )}
            </div>
            <CommandPanel />
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
