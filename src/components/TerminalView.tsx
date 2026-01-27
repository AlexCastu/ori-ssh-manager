import { useEffect, useRef, useCallback } from 'react';
import { X, Circle, RefreshCw, StopCircle, Copy, ClipboardList } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTerminal } from '../hooks/useTerminal';
import { sshService } from '../hooks/sshService';
import { useTheme } from '../contexts/ThemeContext';

interface TerminalViewProps {
  tabId: string;
}

// Max buffer size: 500KB to prevent memory issues on long sessions
const MAX_BUFFER_SIZE = 500 * 1024;

// Trim buffer keeping only the last portion when it exceeds max size
function trimBuffer(buffer: string, maxSize: number): string {
  if (buffer.length <= maxSize) return buffer;
  // Keep the last 80% of max size to avoid frequent trimming
  const keepSize = Math.floor(maxSize * 0.8);
  return buffer.slice(-keepSize);
}

export function TerminalView({ tabId }: TerminalViewProps) {
  const { tabs, sessions, closeTab, updateTabStatus, settings, addToast, getTabBuffer, setTabBuffer } = useStore();
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasConnectedRef = useRef(false);
  const currentChannelRef = useRef<string | null>(null);
  const bufferRef = useRef('');

  const tab = tabs.find((t) => t.id === tabId);
  const session = sessions.find((s) => s.id === tab?.sessionId);

  const terminalBackground = settings?.terminalTheme === 'nord-light' ? '#eceff4' : '#2e3440';

  const handleData = useCallback(
    (data: string) => {
      if (tab?.channelId) {
        sshService.send(tab.channelId, data);
      }
    },
    [tab?.channelId]
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      if (!tab?.channelId) return;
      if (tab.status !== 'connected') return;
      sshService.resize(tab.channelId, cols, rows).catch((err) => {
        console.error('Resize failed', { tabId, channelId: tab.channelId, cols, rows, err });
      });
    },
    [tab?.channelId, tab?.status, tabId]
  );

  const { initTerminal, write, writeln, focus, fit, getSize, getBufferText, getLastBlock, scrollToBottom } = useTerminal({
    onData: handleData,
    onResize: handleResize,
  });

  useEffect(() => {
    if (!containerRef.current || !session || !tab) return;

    const cleanup = initTerminal(containerRef.current);

    const previousBuffer = getTabBuffer(tabId);
    if (previousBuffer) {
      bufferRef.current = previousBuffer;
      write(previousBuffer);
      scrollToBottom();
    } else {
      bufferRef.current = '';
    }

    const onDataCallback = (data: string) => {
      write(data);
      bufferRef.current = trimBuffer(bufferRef.current + data, MAX_BUFFER_SIZE);
    };

    const attachToChannel = (channelId: string) => {
      currentChannelRef.current = channelId;
      sshService.startReading(channelId, onDataCallback);

      setTimeout(() => {
        fit();
        const size = getSize();
        sshService.resize(channelId, size.cols, size.rows).catch((err) => {
          console.error('Resize after attach failed', { tabId, channelId, err });
        });
        focus();

        // Enable auto-reconnect
        if (session) {
          sshService.enableAutoReconnect(tabId, session, size.cols, size.rows, onDataCallback);
        }
      }, 200);
    };

    const doConnectOrAttach = async () => {
      fit();
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (tab.channelId) {
        attachToChannel(tab.channelId);
        hasConnectedRef.current = true;
        return;
      }

      const { cols, rows } = getSize();

      const connectMsg = `\x1b[33mConnecting to ${session.name} (${session.host})...\x1b[0m\r\n`;
      write(connectMsg);
      bufferRef.current += connectMsg;

      const channelId = await sshService.connect(tabId, session, cols, rows);

      if (channelId) {
        hasConnectedRef.current = true;
        attachToChannel(channelId);
      } else {
        writeln(`\x1b[31mConnection failed. Click reconnect to retry.\x1b[0m`);
        hasConnectedRef.current = false;
        addToast({
          type: 'error',
          title: 'Conexión fallida',
          message: 'No se pudo establecer la sesión SSH',
          duration: 3000,
        });
      }
    };

    doConnectOrAttach();

    setTimeout(() => focus(), 50);

    return () => {
      const channelToClean = currentChannelRef.current || tab.channelId;
      if (channelToClean) {
        sshService.stopReading(channelToClean);
      }
      // Disable auto-reconnect when unmounting
      sshService.disableAutoReconnect(tabId);
      const persisted = bufferRef.current || getBufferText();
      setTabBuffer(tabId, persisted || '');

      cleanup?.();
    };
  }, [tabId, tab?.channelId, session?.id, initTerminal, fit, getSize, write, focus, writeln, getTabBuffer, setTabBuffer, getBufferText, scrollToBottom, addToast]);

  useEffect(() => {
    const handleWindowResize = () => fit();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [fit]);

  const handleReconnect = async () => {
    if (!session || !tab) return;

    if (tab.channelId) {
      await sshService.disconnect(tabId, tab.channelId);
    }

    writeln(`\r\n\x1b[33mReconnecting...\x1b[0m\r\n`);
    updateTabStatus(tabId, 'connecting');

    const { cols, rows } = getSize();
    const channelId = await sshService.connect(tabId, session, cols, rows);
    if (channelId) {
      setTimeout(() => fit(), 100);
      sshService.startReading(channelId, (data) => {
        write(data);
        bufferRef.current = trimBuffer(bufferRef.current + data, MAX_BUFFER_SIZE);
      });
    }
  };

  const handleStop = async () => {
    if (!tab?.channelId) return;

    await sshService.disconnect(tabId, tab.channelId);
    writeln(`\r\n\x1b[33m━━━ Session disconnected ━━━\x1b[0m\r\n`);
  };

  const handleClose = async () => {
    if (tab?.channelId) {
      await sshService.disconnect(tabId, tab.channelId);
    }
    closeTab(tabId);
  };

  const sanitizeCopiedText = (raw: string) => {
    return raw
      .split('\n')
      .filter((line) => !/^last login/i.test(line.trim()))
      .join('\n')
      .trim();
  };

  const handleCopyOutput = async () => {
    const text = sanitizeCopiedText(getBufferText());
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      addToast({
        type: 'success',
        title: 'Copiado',
        message: 'Salida copiada al portapapeles',
        duration: 2500,
      });
    } catch (error) {
      console.error('Copy failed', error);
      addToast({
        type: 'error',
        title: 'Error al copiar',
        message: 'No se pudo copiar la salida',
      });
    }
  };

  const handleCopyLastCommand = async () => {
    const text = sanitizeCopiedText(getLastBlock());
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      addToast({
        type: 'success',
        title: 'Copiado',
        message: 'Último bloque copiado',
        duration: 2000,
      });
    } catch (error) {
      console.error('Copy last block failed', error);
      addToast({
        type: 'error',
        title: 'Error al copiar',
        message: 'No se pudo copiar el bloque',
      });
    }
  };

  if (!tab || !session) return null;

  const statusConfig = {
    idle: { color: 'text-zinc-500', label: 'Idle' },
    connecting: { color: 'text-yellow-500 animate-pulse', label: 'Connecting...' },
    connected: { color: 'text-green-500', label: 'Connected' },
    disconnected: { color: 'text-zinc-500', label: 'Disconnected' },
    error: { color: 'text-red-500', label: 'Error' },
  }[tab.status];

  const isConnected = tab.status === 'connected';

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: terminalBackground }}>
      {/* Tab Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 ${
        isDark
          ? 'bg-zinc-900/80 border-white/5'
          : 'bg-white/80 border-zinc-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Circle className={`w-2.5 h-2.5 ${statusConfig.color}`} fill="currentColor" />
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              isDark ? 'bg-white/5 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
            }`}>
              {statusConfig.label}
            </span>
          </div>
          <span
            className={`text-sm font-medium ${isDark ? 'text-white' : 'text-zinc-900'}`}
            title={tab.title}
          >
            {tab.title}
          </span>
          <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            {session.username}@{session.host}:{session.port}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isConnected && (
            <button
              onClick={handleStop}
              aria-label="Disconnect"
              className={`p-1.5 rounded-lg transition-colors ${
                isDark
                  ? 'hover:bg-white/5 text-zinc-400 hover:text-orange-400'
                  : 'hover:bg-zinc-100 text-zinc-500 hover:text-orange-600'
              }`}
              title="Disconnect"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleCopyOutput}
              aria-label="Copiar todo"
            className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium uppercase tracking-tight ${
              isDark
                ? 'hover:bg-white/5 text-zinc-400 hover:text-blue-300'
                : 'hover:bg-zinc-100 text-zinc-500 hover:text-blue-600'
            }`}
            title="Copiar todo"
          >
            <Copy className="w-4 h-4" />
            <span>All</span>
          </button>
          <button
            onClick={handleCopyLastCommand}
              aria-label="Copiar último bloque"
            className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium uppercase tracking-tight ${
              isDark
                ? 'hover:bg-white/5 text-zinc-400 hover:text-emerald-300'
                : 'hover:bg-zinc-100 text-zinc-500 hover:text-emerald-600'
            }`}
            title="Copiar último comando/bloque"
          >
            <ClipboardList className="w-4 h-4" />
            <span>Last</span>
          </button>
          {(tab.status === 'disconnected' || tab.status === 'error') && (
            <button
              onClick={handleReconnect}
              aria-label="Reconnect"
              className={`p-1.5 rounded-lg transition-colors ${
                isDark
                  ? 'hover:bg-white/5 text-zinc-400 hover:text-green-400'
                  : 'hover:bg-zinc-100 text-zinc-500 hover:text-green-600'
              }`}
              title="Reconnect"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            aria-label="Cerrar pestaña"
            className={`p-1.5 rounded-lg transition-colors ${
              isDark
                ? 'hover:bg-white/5 text-zinc-400 hover:text-red-400'
                : 'hover:bg-zinc-100 text-zinc-500 hover:text-red-600'
            }`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Container - compact padding */}
      <div
        ref={containerRef}
        className="flex-1 p-2 overflow-hidden min-h-0"
        onClick={() => focus()}
      />
    </div>
  );
}
