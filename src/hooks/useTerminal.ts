import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: options.fontSize ?? 14,
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

    // Handle resize with debounce to avoid excessive fit() calls
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        fitAddon.fit();
        options.onResize?.(terminal.cols, terminal.rows);
      }, 50);
    });
    resizeObserver.observe(container);

    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
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

  // Strip ANSI escape codes from text
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

  const setFontSize = useCallback((size: number) => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = size;
      fitAddonRef.current?.fit();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
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
    setFontSize,
    terminal: terminalRef.current,
  };
}
