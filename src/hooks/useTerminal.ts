import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../store/useStore';
import type { TerminalTheme, TerminalFontSize } from '../types';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

// Nord Dark theme for terminal
const nordDarkTheme = {
  // Darker base + lighter fg for more contrast on names
  background: '#1f2633',
  foreground: '#edf1fa',
  cursor: '#edf1fa',
  cursorAccent: '#1f2633',
  selectionBackground: '#65738a80',
  black: '#2f3542',
  red: '#e27878',
  green: '#3b680a',
  yellow: '#f3d99c',
  // High-contrast blues/cyans so directories/links pop
  blue: '#8cc4ff',
  magenta: '#c7a0ff',
  cyan: '#7de3ff',
  white: '#f5f7ff',
  brightBlack: '#4b5568',
  brightRed: '#f08c82',
  brightGreen: '#b9f287',
  brightYellow: '#ffe2a8',
  brightBlue: '#b3d7ff',
  brightMagenta: '#d7b5ff',
  brightCyan: '#a4f0ff',
  brightWhite: '#ffffff',
};

// Nord Light theme for terminal
const nordLightTheme = {
  background: '#eceff4',
  foreground: '#2e3440',
  cursor: '#2e3440',
  cursorAccent: '#eceff4',
  selectionBackground: '#d8dee980',
  black: '#2e3440',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#d08770',
  blue: '#5e81ac',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
};

const getTerminalTheme = (themeName: TerminalTheme) => {
  return themeName === 'nord-light' ? nordLightTheme : nordDarkTheme;
};

const fontSizeMap: Record<TerminalFontSize, number> = {
  small: 12,
  medium: 14,
  large: 16,
};

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeTickingRef = useRef(false);
  const onDataRef = useRef(options.onData);
  const onResizeRef = useRef(options.onResize);
  const settings = useStore((state) => state.settings);

  // Keep refs updated
  useEffect(() => {
    onDataRef.current = options.onData;
    onResizeRef.current = options.onResize;
  }, [options.onData, options.onResize]);

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    const themeName = settings?.terminalTheme || 'nord-dark';
    const theme = getTerminalTheme(themeName);

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: fontSizeMap[settings.terminalFontSize ?? 'medium'],
      lineHeight: 1.2,
      theme,
      allowTransparency: true,
      scrollback: 10000,
      // Important for interaction
      disableStdin: false,
      allowProposedApi: true,
      convertEol: true,
      wordWrap: true,
      padding: 8,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(container);

    // Focus terminal immediately
    terminal.focus();

    // Initial fit
    fitAddon.fit();

    // Handle user input - use refs to get latest callback
    terminal.onData((data) => {
      onDataRef.current?.(data);
    });

    // Handle resize events from terminal
    terminal.onResize(({ cols, rows }) => {
      onResizeRef.current?.(cols, rows);
    });

    // Make terminal focusable and capture all input
    terminal.attachCustomKeyEventHandler(() => true);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    containerRef.current = container;

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTickingRef.current) return;
      resizeTickingRef.current = true;
      requestAnimationFrame(() => {
        fitAddon.fit();
        resizeTickingRef.current = false;
      });
    });
    resizeObserver.observe(container);

    // Notify initial size
    setTimeout(() => {
      if (terminal.cols && terminal.rows) {
        onResizeRef.current?.(terminal.cols, terminal.rows);
      }
    }, 50);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [settings?.terminalTheme, settings?.terminalFontSize]); // Remove callbacks from deps - use refs instead

  // Update terminal theme when settings change
  useEffect(() => {
    if (terminalRef.current && settings?.terminalTheme) {
      const theme = getTerminalTheme(settings.terminalTheme);
      terminalRef.current.options.theme = theme;
    }
  }, [settings?.terminalTheme]);

  useEffect(() => {
    if (terminalRef.current && settings?.terminalFontSize) {
      const size = fontSizeMap[settings.terminalFontSize] ?? fontSizeMap.medium;
      terminalRef.current.options.fontSize = size;
      fitAddonRef.current?.fit();
    }
  }, [settings?.terminalFontSize]);

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

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const getSize = useCallback(() => {
    const term = terminalRef.current;
    if (term) {
      return { cols: term.cols, rows: term.rows };
    }
    return { cols: 80, rows: 24 };
  }, []);

  const getBufferText = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return '';

    const buffer = term.buffer.active;
    const lines: string[] = [];

    for (let i = 0; i < buffer.length; i += 1) {
      const line = buffer.getLine(i)?.translateToString(true) ?? '';
      lines.push(line);
    }

    return lines.join('\n').trimEnd();
  }, []);

  const getLastBlock = useCallback((maxLines = 80) => {
    const term = terminalRef.current;
    if (!term) return '';

    const buffer = term.buffer.active;
    const lines: string[] = [];

    // Walk from bottom, skip trailing empties
    let seenText = false;
    for (let i = buffer.length - 1; i >= 0 && lines.length < maxLines; i -= 1) {
      const raw = buffer.getLine(i)?.translateToString(true) ?? '';
      const trimmed = raw.trimEnd();

      if (!seenText && trimmed.length === 0) {
        continue; // skip blank tail
      }

      seenText = true;
      if (seenText && trimmed.length === 0) {
        break; // stop at first blank after content -> treat as block separator
      }

      lines.push(trimmed);
    }

    return lines.reverse().join('\n').trimEnd();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      terminalRef.current?.dispose();
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
    terminal: terminalRef.current,
  };
}
