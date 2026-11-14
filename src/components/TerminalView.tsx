import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Circle, RefreshCw, StopCircle, Copy, ClipboardList, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { useTerminal } from '../hooks/useTerminal';
import { sshService } from '../hooks/sshService';

interface TerminalViewProps {
  tabId: string;
  isActive: boolean;
}

// Base font size in px per settings option (zoom multiplies on top)
const FONT_SIZES = { small: 12, medium: 14, large: 16 } as const;

export function TerminalView({ tabId, isActive }: TerminalViewProps) {
  const { tabs, sessions, closeTab, updateTabStatus, settings, addToast, terminalZoom } = useStore(
    useShallow((s) => ({
      tabs: s.tabs,
      sessions: s.sessions,
      closeTab: s.closeTab,
      updateTabStatus: s.updateTabStatus,
      settings: s.settings,
      addToast: s.addToast,
      terminalZoom: s.terminalZoom,
    }))
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const currentChannelRef = useRef<string | null>(null);

  const tab = tabs.find((t) => t.id === tabId);
  const session = sessions.find((s) => s.id === tab?.sessionId);

  const isLightTheme = settings?.terminalTheme === 'nord-light';
  const terminalBackground = isLightTheme ? '#eceff4' : '#2e3440';
  const baseFontSize = FONT_SIZES[settings?.terminalFontSize ?? 'medium'];
  const fontSize = Math.round(baseFontSize * terminalZoom);
  const cursorStyle = settings?.cursorStyle ?? 'block';
  const scrollback = settings?.scrollback ?? 10000;

  // Keep the channel ref in sync with the store (covers auto-reconnect,
  // where sshService creates a new channelId without remounting this view)
  useEffect(() => {
    currentChannelRef.current = tab?.channelId ?? null;
  }, [tab?.channelId]);

  const handleData = useCallback((data: string) => {
    const channelId = currentChannelRef.current;
    if (channelId) {
      sshService.send(channelId, data);
    }
  }, []);

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      const channelId = currentChannelRef.current;
      if (!channelId) return;
      const currentTab = useStore.getState().tabs.find((t) => t.id === tabId);
      if (currentTab?.status !== 'connected') return;
      sshService.resize(channelId, cols, rows).catch((err) => {
        console.error('Resize failed', { tabId, channelId, cols, rows, err });
      });
    },
    [tabId]
  );

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { initTerminal, write, writeln, focus, fit, getSize, getBufferText, getLastBlock, applyOptions, findNext, findPrevious, clearSearch } = useTerminal({
    onData: handleData,
    onResize: handleResize,
    fontSize,
    background: terminalBackground,
    isLight: isLightTheme,
    cursorStyle,
    scrollback,
  });

  // Apply settings changes (theme, font size/zoom, cursor, scrollback) to the
  // live terminal without recreating it
  useEffect(() => {
    applyOptions();
  }, [applyOptions, fontSize, terminalBackground, isLightTheme, cursorStyle, scrollback]);

  // Mount terminal + connect exactly once per tab.
  // Depends only on tabId so the terminal is NOT destroyed and
  // recreated when channelId/status change after connecting.
  useEffect(() => {
    const state = useStore.getState();
    const currentTab = state.tabs.find((t) => t.id === tabId);
    const currentSession = state.sessions.find((s) => s.id === currentTab?.sessionId);
    if (!containerRef.current || !currentTab || !currentSession) return;

    const cleanup = initTerminal(containerRef.current);

    // Multi-hop connection progress ("Hop 1/2: ...") written into the terminal
    sshService.onProgress(tabId, (message) => {
      const line = `\x1b[36m${message}\x1b[0m\r\n`;
      write(line);
    });

    const attachToChannel = (channelId: string) => {
      currentChannelRef.current = channelId;
      sshService.startReading(channelId, write);

      setTimeout(() => {
        fit();
        const size = getSize();
        sshService.resize(channelId, size.cols, size.rows).catch((err) => {
          console.error('Resize after attach failed', { tabId, channelId, err });
        });
        if (useStore.getState().activeTabId === tabId) focus();

        // Enable auto-reconnect
        sshService.enableAutoReconnect(tabId, currentSession, size.cols, size.rows, write);
      }, 200);
    };

    const doConnect = async () => {
      fit();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { cols, rows } = getSize();

      const connectMsg = `\x1b[33mConnecting to ${currentSession.name} (${currentSession.host})...\x1b[0m\r\n`;
      write(connectMsg);

      const channelId = await sshService.connect(tabId, currentSession, cols, rows);

      if (channelId) {
        attachToChannel(channelId);
      } else if (useStore.getState().tabs.some((t) => t.id === tabId)) {
        writeln(`\x1b[31mConnection failed. Click reconnect to retry.\x1b[0m`);
        useStore.getState().addToast({
          type: 'error',
          title: 'Conexión fallida',
          message: 'No se pudo establecer la sesión SSH',
          duration: 3000,
        });
      }
    };

    doConnect();

    setTimeout(() => {
      if (useStore.getState().activeTabId === tabId) focus();
    }, 50);

    return () => {
      // Never throw from unmount cleanup: it would tear down the whole app
      try {
        if (currentChannelRef.current) {
          sshService.stopReading(currentChannelRef.current);
        }
        sshService.offProgress(tabId);
        sshService.disableAutoReconnect(tabId);
      } catch (e) {
        console.warn('Terminal teardown failed', e);
      }
      cleanup?.();
    };
  }, [tabId, initTerminal, fit, getSize, write, focus, writeln]);

  useEffect(() => {
    if (!isActive) return;
    fit();
    focus();
  }, [isActive, fit, focus]);

  useEffect(() => {
    const handleWindowResize = () => fit();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [fit]);

  // Cmd+F (macOS) / Ctrl+Shift+F opens in-terminal search, Escape closes it.
  // Plain Ctrl+F is NOT intercepted: it's forward-char in bash/readline.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (useStore.getState().activeTabId !== tabId) return;
      const key = e.key.toLowerCase();
      const isSearchCombo =
        (e.metaKey && !e.ctrlKey && key === 'f') || (e.ctrlKey && e.shiftKey && key === 'f');

      if (isSearchCombo) {
        e.preventDefault();
        e.stopPropagation(); // keep the combo away from xterm
        setSearchOpen(true);
        setTimeout(() => {
          if (useStore.getState().activeTabId === tabId) searchInputRef.current?.focus();
        }, 0);
      } else if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, tabId]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    clearSearch();
    if (useStore.getState().activeTabId === tabId) focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious(searchQuery);
      } else {
        findNext(searchQuery);
      }
    }
  };

  const handleReconnect = async () => {
    if (!session || !tab) return;

    if (tab.channelId) {
      await sshService.disconnect(tabId, tab.channelId);
    }

    writeln(`\r\n\x1b[33mReconnecting to ${session.name} (${session.host})...\x1b[0m`);
    updateTabStatus(tabId, 'connecting');

    const { cols, rows } = getSize();
    const channelId = await sshService.connect(tabId, session, cols, rows);
    if (channelId) {
      currentChannelRef.current = channelId;
      setTimeout(() => fit(), 100);
      sshService.startReading(channelId, write);
      sshService.enableAutoReconnect(tabId, session, cols, rows, write);
    } else {
      writeln(`\x1b[31mReconnection failed.\x1b[0m`);
    }
  };

  const handleStop = async () => {
    if (!tab?.channelId) return;

    await sshService.disconnect(tabId, tab.channelId);
    writeln(`\r\n\x1b[33m━━━ Session disconnected ━━━\x1b[0m\r\n`);
  };

  const handleClose = () => {
    closeTab(tabId);
  };

  const sanitizeCopiedText = (raw: string) => {
    return raw
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '') // Strip ANSI escape codes
      .split('\n')
      .filter((line) => !/^last login/i.test(line.trim()))
      .filter((line) => !/^Connecting to /i.test(line.trim()))
      .filter((line) => !/^Reconnecting to /i.test(line.trim()))
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
    idle: { color: 'text-texto-tenue', label: 'Inactivo' },
    connecting: { color: 'text-aviso animate-pulse', label: 'Conectando...' },
    connected: { color: 'text-exito', label: 'Conectado' },
    disconnected: { color: 'text-texto-tenue', label: 'Desconectado' },
    error: { color: 'text-peligro', label: 'Error' },
  }[tab.status];

  const isConnected = tab.status === 'connected';

  return (
    <div
      className={`absolute inset-0 flex overflow-hidden p-3 ${isActive ? '' : 'invisible pointer-events-none'}`}
      aria-hidden={!isActive}
    >
      {/* Main Terminal Section */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-2xl border border-borde shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
        {/* Tab Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-panel backdrop-blur-2xl border-borde">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Circle className={`w-2.5 h-2.5 ${statusConfig.color}`} fill="currentColor" />
              <span className={`text-[11px] px-2 py-0.5 rounded-full bg-superficie ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
            <span className="text-sm font-medium text-texto" title={tab.title}>
              {tab.title}
            </span>
            <span className="text-xs text-texto-tenue">
              {session.username}@{session.host}:{session.port}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isConnected && (
              <button
                onClick={handleStop}
                aria-label="Desconectar"
                className="btn-icono hover:text-aviso"
                title="Desconectar"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleCopyOutput}
              aria-label="Copiar todo"
              className="btn-icono px-2 flex items-center gap-1 text-xs font-medium uppercase tracking-tight hover:text-acento"
              title="Copiar todo"
            >
              <Copy className="w-4 h-4" />
              <span>Todo</span>
            </button>
            <button
              onClick={handleCopyLastCommand}
              aria-label="Copiar último bloque"
              className="btn-icono px-2 flex items-center gap-1 text-xs font-medium uppercase tracking-tight hover:text-exito"
              title="Copiar último comando/bloque"
            >
              <ClipboardList className="w-4 h-4" />
              <span>Último</span>
            </button>
            {(tab.status === 'disconnected' || tab.status === 'error') && (
              <button
                onClick={handleReconnect}
                aria-label="Reconectar"
                className="btn-icono hover:text-exito"
                title="Reconectar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleClose}
              aria-label="Cerrar pestaña"
              className="btn-icono hover:text-peligro"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Container: padding lives on the wrapper so FitAddon
            measures the inner element's exact content box */}
        <div
          className="relative flex-1 min-h-0 overflow-hidden px-2 pt-1 pb-2"
          style={{ backgroundColor: terminalBackground }}
          onClick={() => focus()}
        >
          {searchOpen && (
            <div
              className="modal-cristal absolute top-2 right-4 z-10 flex items-center gap-1 px-2 py-1.5 rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Search className="w-4 h-4 text-texto-tenue shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  findNext(e.target.value);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar... (Enter / Shift+Enter)"
                className="campo w-52"
              />
              <button
                onClick={() => findPrevious(searchQuery)}
                className="btn-icono"
                title="Anterior (Shift+Enter)"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => findNext(searchQuery)}
                className="btn-icono"
                title="Siguiente (Enter)"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={closeSearch}
                className="btn-icono"
                title="Cerrar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div ref={containerRef} className="h-full w-full overflow-hidden" />
        </div>
      </div>
    </div>
  );
}
