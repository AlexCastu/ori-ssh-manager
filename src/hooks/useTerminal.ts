import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
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
      },
      allowTransparency: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(container);
    fitAddon.fit();

    // Handle user input
    terminal.onData((data) => {
      options.onData?.(data);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    containerRef.current = container;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      options.onResize?.(terminal.cols, terminal.rows);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [options.onData]);

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

  const getBufferText = useCallback(() => {
    if (!terminalRef.current) return '';
    const buffer = terminalRef.current.buffer.active;
    let text = '';
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) text += line.translateToString(true) + '\n';
    }
    return text.trimEnd();
  }, []);

  const getLastBlock = useCallback(() => {
    if (!terminalRef.current) return '';
    const buffer = terminalRef.current.buffer.active;
    const lines: string[] = [];

    // Leer últimas líneas del buffer
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }

    // Buscar desde el final hacia arriba el último prompt
    let lastPromptIndex = lines.length - 1;
    for (let i = lines.length - 2; i >= 0; i--) {
      if (lines[i].match(/[$#>]\s*$/)) {
        lastPromptIndex = i;
        break;
      }
    }

    return lines.slice(Math.max(0, lastPromptIndex)).join('\n').trim();
  }, []);

  const scrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
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
