import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Circle, RefreshCw, StopCircle, Copy, ClipboardList, FolderOpen, ZoomIn, ZoomOut } from 'lucide-react';
import { FileBrowser } from './FileBrowser';
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
  const { tabs, sessions, closeTab, updateTabStatus, settings, addToast, getTabBuffer, setTabBuffer, terminalZoom, setTerminalZoom } = useStore();
  const { isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasConnectedRef = useRef(false);
  const currentChannelRef = useRef<string | null>(null);
  const bufferRef = useRef('');
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const writeRef = useRef<((data: string) => void) | null>(null);

  const tab = tabs.find((t) => t.id === tabId);
  const session = sessions.find((s) => s.id === tab?.sessionId);

  const terminalBackground = settings?.terminalTheme === 'nord-light' ? '#eceff4' : '#2e3440';

  // Track user input to detect exit commands
  const inputBufferRef = useRef('');

  // Common exit commands across different platforms/shells
  const EXIT_COMMANDS = ['exit', 'logout', 'quit', 'bye', 'disconnect', 'close', 'q', 'halt', 'poweroff', 'shutdown'];

  const handleData = useCallback(
    (data: string) => {
      if (tab?.channelId) {
        // Track what user types to detect exit commands
        if (data === '\r' || data === '\n') {
          // User pressed Enter - check if they typed an exit command
          const cmd = inputBufferRef.current.trim().toLowerCase();
          if (EXIT_COMMANDS.includes(cmd)) {
            // Mark this as intentional exit so we don't auto-reconnect
            sshService.markIntentionalExit(tabId);
            // Show message in terminal using ref
            setTimeout(() => {
              if (writeRef.current) {
                writeRef.current('\r\n\x1b[33m[Sesión terminada por el usuario]\x1b[0m\r\n');
              }
            }, 100);
          }
          inputBufferRef.current = '';
        } else if (data === '\x7f' || data === '\b') {
          // Backspace
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
          // Regular printable character
          inputBufferRef.current += data;
        } else if (data === '\x03') {
          // Ctrl+C - clear buffer
          inputBufferRef.current = '';
        } else if (data === '\x04') {
          // Ctrl+D - EOF, also an exit signal
          sshService.markIntentionalExit(tabId);
          setTimeout(() => {
            if (writeRef.current) {
              writeRef.current('\r\n\x1b[33m[Sesión terminada - EOF]\x1b[0m\r\n');
            }
          }, 100);
        }

        sshService.send(tab.channelId, data);
      }
    },
    [tab?.channelId, tabId]
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

  const { initTerminal, write, writeln, focus, fit, getSize, getBufferText, getLastBlock, scrollToBottom, setFontSize, setTheme } = useTerminal({
    onData: handleData,
    onResize: handleResize,
    fontSize: Math.round(14 * terminalZoom),
    terminalTheme: settings?.terminalTheme || 'nord-dark',
  });

  // Keep writeRef updated
  useEffect(() => {
    writeRef.current = write;
  }, [write]);

  // Update font size when zoom changes
  useEffect(() => {
    setFontSize(Math.round(14 * terminalZoom));
  }, [terminalZoom, setFontSize]);

  // Update terminal theme when settings change
  useEffect(() => {
    setTheme(settings?.terminalTheme || 'nord-dark');
  }, [settings?.terminalTheme, setTheme]);

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
        writeln(`\x1b[31mConexión fallida. Haz clic en reconectar para reintentar.\x1b[0m`);
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

    writeln(`\r\n\x1b[33mReconectando...\x1b[0m\r\n`);
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
    writeln(`\r\n\x1b[33m━━━ Sesión desconectada ━━━\x1b[0m\r\n`);
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
      // Filtrar líneas de "last login" y similares
      .filter((line) => !/^last login/i.test(line.trim()))
      // Eliminar líneas vacías duplicadas consecutivas
      .reduce((acc: string[], line, i, arr) => {
        const trimmed = line.trim();
        const prevTrimmed = arr[i - 1]?.trim() ?? '';
        // No añadir si ambas están vacías (evitar múltiples líneas vacías)
        if (trimmed === '' && prevTrimmed === '' && i > 0) {
          return acc;
        }
        acc.push(line);
        return acc;
      }, [])
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
    idle: { color: 'text-[var(--text-tertiary)]', label: 'Inactivo' },
    connecting: { color: 'text-[var(--warning)] animate-pulse', label: 'Conectando...' },
    connected: { color: 'text-[var(--success)]', label: 'Conectado' },
    disconnected: { color: 'text-[var(--text-tertiary)]', label: 'Desconectado' },
    error: { color: 'text-[var(--error)]', label: 'Error' },
  }[tab.status];

  const isConnected = tab.status === 'connected';

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: terminalBackground }}>
      {/* Tab Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b shrink-0 ${
        isDark
          ? 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
          : 'bg-[var(--bg-primary)] border-[var(--border-primary)]'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Circle className={`w-2.5 h-2.5 ${statusConfig.color}`} fill="currentColor" />
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              isDark ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
            }`}>
              {statusConfig.label}
            </span>
          </div>
          <span
            className="text-sm font-semibold text-[var(--text-primary)]"
            title={tab.title}
          >
            {tab.title}
          </span>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {session.username}@{session.host}:{session.port}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom Controls */}
          <div className={`flex items-center gap-0.5 mr-2 border-r pr-2 ${isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'}`}>
            <button
              onClick={() => setTerminalZoom(terminalZoom - 0.1)}
              className={`p-1 rounded transition-colors ${
                isDark ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Reducir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className={`text-[10px] w-7 text-center font-mono font-medium ${isDark ? 'text-[var(--text-secondary)]' : 'text-[var(--text-secondary)]'}`}>
              {Math.round(terminalZoom * 100)}%
            </span>
            <button
              onClick={() => setTerminalZoom(terminalZoom + 0.1)}
              className={`p-1 rounded transition-colors ${
                isDark ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
          {isConnected && (
            <>
              <button
                onClick={() => setShowFileBrowser(!showFileBrowser)}
                aria-label="Explorador de archivos"
                className={`p-1.5 rounded-lg transition-colors ${
                  showFileBrowser
                    ? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                    : isDark
                      ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
                      : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
                }`}
                title="Explorador de archivos (SFTP)"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              <button
                onClick={handleStop}
                aria-label="Desconectar"
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark
                    ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--warning)]'
                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--warning)]'
                }`}
                title="Desconectar"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={handleCopyOutput}
              aria-label="Copiar todo"
            className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium uppercase tracking-tight ${
              isDark
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
            }`}
            title="Copiar todo"
          >
            <Copy className="w-4 h-4" />
            <span>Todo</span>
          </button>
          <button
            onClick={handleCopyLastCommand}
              aria-label="Copiar último bloque"
            className={`px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium uppercase tracking-tight ${
              isDark
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--success)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--success)]'
            }`}
            title="Copiar último comando/bloque"
          >
            <ClipboardList className="w-4 h-4" />
            <span>Último</span>
          </button>
          {(tab.status === 'disconnected' || tab.status === 'error') && (
            <button
              onClick={handleReconnect}
              aria-label="Reconectar"
              className={`p-1.5 rounded-lg transition-colors ${
                isDark
                  ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--success)]'
                  : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--success)]'
              }`}
              title="Reconectar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            aria-label="Cerrar pestaña"
            className={`p-1.5 rounded-lg transition-colors ${
              isDark
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--error)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--error)]'
            }`}
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main content area with optional FileBrowser */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Terminal Container */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 min-w-0"
          style={{ overflow: 'hidden', padding: '8px' }}
          onClick={() => focus()}
        />

        {/* File Browser Panel */}
        {showFileBrowser && isConnected && (
          <FileBrowser
            channelId={tab.channelId ?? null}
            onClose={() => setShowFileBrowser(false)}
            onNavigate={(path) => {
              // Optionally cd in terminal too
              if (tab.channelId) {
                sshService.send(tab.channelId, `cd "${path}"\n`);
              }
            }}
            onCommand={(command) => {
              // Log SFTP operations in terminal
              if (tab.channelId && terminalRef.current) {
                terminalRef.current.write(`\r\n\x1b[90m# ${command}\x1b[0m\r\n`);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
