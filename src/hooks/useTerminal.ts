import { useEffect, useRef, useCallback } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';

// Highlight matches while searching (Ctrl/Cmd+F)
const SEARCH_DECORATIONS = {
  matchOverviewRuler: '#eab308',
  activeMatchColorOverviewRuler: '#f97316',
  matchBackground: '#eab30855',
  activeMatchBackground: '#f9731688',
} as const;

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
  background?: string;
  isLight?: boolean;
  cursorStyle?: 'block' | 'bar' | 'underline';
  scrollback?: number;
}

function buildTheme(opts: UseTerminalOptions): ITheme {
  const baseTheme = opts.isLight ? LIGHT_THEME : DARK_THEME;
  return opts.background
    ? { ...baseTheme, background: opts.background, cursorAccent: opts.background }
    : baseTheme;
}

const DARK_THEME: ITheme = {
  background: '#0a0a0f',
  foreground: '#e4e4e7',
  cursor: '#3b82f6',
  cursorAccent: '#0a0a0f',
  selectionBackground: '#3b82f640',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
};

const LIGHT_THEME: ITheme = {
  background: '#eceff4',
  foreground: '#2e3440',
  cursor: '#5e81ac',
  cursorAccent: '#eceff4',
  selectionBackground: '#88c0d066',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#d08770',
  blue: '#5e81ac',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#8fbcbb',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
};

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest options in a ref so callbacks never go stale
  // and initTerminal stays referentially stable (no terminal re-creation).
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    const opts = optionsRef.current;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: opts.cursorStyle ?? 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: opts.fontSize ?? 14,
      lineHeight: 1.2,
      theme: buildTheme(opts),
      // Opaque background: transparency + WebGL is a known source of black
      // screens / compositor issues on WKWebView
      allowTransparency: false,
      scrollback: opts.scrollback ?? 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    terminal.open(container);

    // Renderer en cascada: WebGL (GPU) → Canvas 2D → DOM. En Windows bajo
    // RDP, VMs o GPUs antiguas WebGL no está disponible y el renderer DOM es
    // muy lento; el canvas mantiene el rendimiento en esos casos.
    // Disposal is guarded: context-loss events can fire after dispose when
    // terminals are created/destroyed on tab switches.
    const loadCanvasFallback = () => {
      try {
        terminal.loadAddon(new CanvasAddon());
        console.warn('WebGL unavailable, using canvas renderer');
      } catch (e) {
        console.warn('Canvas renderer unavailable, using DOM renderer', e);
      }
    };
    let webglAddon: WebglAddon | null = null;
    const disposeWebgl = () => {
      const addon = webglAddon;
      webglAddon = null;
      if (addon) {
        try {
          addon.dispose();
        } catch {
          // already disposed by the terminal
        }
      }
    };
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        disposeWebgl();
        loadCanvasFallback();
      });
      terminal.loadAddon(addon);
      webglAddon = addon;
    } catch {
      loadCanvasFallback();
    }

    fitAddon.fit();

    // Handle user input (always reads the latest callback)
    terminal.onData((data) => {
      optionsRef.current.onData?.(data);
    });

    // Notify PTY on ANY dimension change (fit from observer, font-size/zoom
    // changes, etc.) — xterm only fires this when cols/rows actually change
    terminal.onResize(({ cols, rows }) => {
      optionsRef.current.onResize?.(cols, rows);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    containerRef.current = container;

    // Handle resize with debounce to avoid excessive fit() calls
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        fitAddon.fit();
      }, 50);
    });
    resizeObserver.observe(container);

    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeObserver.disconnect();
      // A throw here would unmount the whole React tree (black screen):
      // dispose defensively
      disposeWebgl();
      try {
        terminal.dispose();
      } catch (e) {
        console.warn('Terminal dispose failed', e);
      }
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
        searchAddonRef.current = null;
      }
    };
  }, []);

  const findNext = useCallback((query: string) => {
    if (!query) return false;
    return (
      searchAddonRef.current?.findNext(query, { decorations: SEARCH_DECORATIONS }) ?? false
    );
  }, []);

  const findPrevious = useCallback((query: string) => {
    if (!query) return false;
    return (
      searchAddonRef.current?.findPrevious(query, { decorations: SEARCH_DECORATIONS }) ?? false
    );
  }, []);

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
  }, []);

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const writeln = useCallback((data: string) => {
    terminalRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const getSize = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      fitAddonRef.current.fit();
      return {
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      };
    }
    return { cols: 80, rows: 24 };
  }, []);

  // Strip ANSI escape codes from text
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  const getBufferText = useCallback(() => {
    if (!terminalRef.current) return '';
    const buffer = terminalRef.current.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    return lines.join('\n');
  }, []);

  const getLastBlock = useCallback(() => {
    if (!terminalRef.current) return '';
    const buffer = terminalRef.current.buffer.active;
    const cursorY = buffer.cursorY + buffer.viewportY;
    const lines: string[] = [];

    // Read lines up to cursor position
    for (let i = 0; i <= Math.min(cursorY, buffer.length - 1); i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }

    if (lines.length === 0) return '';

    // Prompt detection: look for common shell prompt patterns
    // Matches: user@host:~$, [user@host ~]$, root#, $, #, %, >, etc.
    const promptRegex = /[$#%>]\s*$/;

    // Find the second-to-last prompt (the one before the current prompt)
    // This gives us the last command + its output
    let promptCount = 0;
    let lastPromptIndex = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const stripped = stripAnsi(lines[i]).trim();
      if (!stripped) continue;
      if (promptRegex.test(stripped)) {
        promptCount++;
        if (promptCount === 2) {
          lastPromptIndex = i;
          break;
        }
      }
    }

    const result = lines.slice(lastPromptIndex)
      .join('\n')
      .trim();

    return stripAnsi(result);
  }, []);

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
  }, []);

  /// Apply the current options (theme, font size, cursor, scrollback) to the
  /// live terminal without recreating it. PTY resize is handled by onResize.
  const applyOptions = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const opts = optionsRef.current;
    terminal.options.theme = buildTheme(opts);
    if (opts.fontSize !== undefined) terminal.options.fontSize = opts.fontSize;
    if (opts.cursorStyle !== undefined) terminal.options.cursorStyle = opts.cursorStyle;
    if (opts.scrollback !== undefined) terminal.options.scrollback = opts.scrollback;
    fitAddonRef.current?.fit();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      try {
        terminalRef.current?.dispose();
      } catch (e) {
        console.warn('Terminal dispose on unmount failed', e);
      }
      terminalRef.current = null;
    };
  }, []);

  return {
    initTerminal,
    write,
    writeln,
    clear,
    focus,
    fit,
    getSize,
    getBufferText,
    getLastBlock,
    scrollToBottom,
    applyOptions,
    findNext,
    findPrevious,
    clearSearch,
  };
}
