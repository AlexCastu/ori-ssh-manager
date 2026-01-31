import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

// Nord Dark theme
const NORD_DARK_THEME = {
  background: '#2e3440',
  foreground: '#eceff4',
  cursor: '#88c0d0',
  cursorAccent: '#2e3440',
  selectionBackground: 'rgba(136, 192, 208, 0.3)',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
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

// Nord Light theme
const NORD_LIGHT_THEME = {
  background: '#eceff4',
  foreground: '#2e3440',
  cursor: '#5e81ac',
  cursorAccent: '#eceff4',
  selectionBackground: 'rgba(94, 129, 172, 0.3)',
  black: '#2e3440',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#d08770',
  blue: '#5e81ac',
  magenta: '#b48ead',
  cyan: '#8fbcbb',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#d08770',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#88c0d0',
  brightWhite: '#eceff4',
};

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
  terminalTheme?: 'nord-dark' | 'nord-light';
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get the appropriate theme
  const getTheme = () => {
    return options.terminalTheme === 'nord-light' ? NORD_LIGHT_THEME : NORD_DARK_THEME;
  };

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }

    const theme = getTheme();

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: options.fontSize ?? 14,
      lineHeight: 1.0,
      theme,
      allowTransparency: false,
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
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          fitAddon.fit();
          options.onResize?.(terminal.cols, terminal.rows);
        });
      }, 100);
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

  const setTheme = useCallback((themeName: 'nord-dark' | 'nord-light') => {
    if (terminalRef.current) {
      const theme = themeName === 'nord-light' ? NORD_LIGHT_THEME : NORD_DARK_THEME;
      terminalRef.current.options.theme = theme;
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
    setTheme,
    terminal: terminalRef.current,
  };
}
