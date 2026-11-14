import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTab } from './types';
import App from './App';

const state = vi.hoisted(() => ({
  isInitialized: true,
  initialize: vi.fn(),
  openSessionModal: vi.fn(),
  tabs: [] as TerminalTab[],
  activeTabId: null as string | null,
  sessions: [{
    id: 'session',
    name: 'Session',
    host: 'example.test',
    port: 22,
    username: 'user',
  }],
  settings: {},
  terminalZoom: 1,
}));

vi.mock('./store/useStore', () => ({
  useStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('./hooks/useTerminal', () => ({
  useTerminal: () => ({}),
}));

vi.mock('./hooks/sshService', () => ({ sshService: {} }));

vi.mock('./components', async () => ({
  TerminalView: (await import('./components/TerminalView')).TerminalView,
  Sidebar: () => null,
  SessionModal: () => null,
  GroupModal: () => null,
  TabBar: () => null,
  CommandPanel: () => null,
  CommandModal: () => null,
  SessionInfoModal: () => null,
  CommandPalette: () => null,
  ToastContainer: () => null,
  TitleBar: () => null,
}));

vi.mock('./components/SettingsModal', () => ({ SettingsModal: () => null }));

describe('App terminal tabs', () => {
  beforeEach(() => {
    state.isInitialized = true;
    state.tabs = ['first', 'second'].map((id) => ({
      id,
      sessionId: 'session',
      title: `Terminal ${id}`,
      status: 'connected',
    }));
    state.activeTabId = 'first';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['first', 'second'])('keeps every terminal rendered when %s is active', (activeTabId) => {
    state.activeTabId = activeTabId;
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('title="Terminal first"');
    expect(html).toContain('title="Terminal second"');
    expect(html.match(/<div[^>]*aria-hidden="true"/g)).toHaveLength(1);
    expect(html.match(/invisible pointer-events-none/g)).toHaveLength(1);
    expect(html).not.toContain('Sin sesión activa');
  });

  it('does not show the empty screen while tabs exist without an active id', () => {
    state.activeTabId = null;
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('title="Terminal first"');
    expect(html).toContain('title="Terminal second"');
    expect(html).not.toContain('Sin sesión activa');
  });

  it('shows the empty screen when there are no tabs', () => {
    state.tabs = [];

    expect(renderToStaticMarkup(<App />)).toContain('Sin sesión activa');
  });

  it.each([
    { userAgent: 'Mac', shortcut: '⌘K', isInitialized: true },
    { userAgent: 'Windows', shortcut: 'Ctrl+K', isInitialized: true },
    { userAgent: 'Mac', shortcut: '⌘K', isInitialized: false },
    { userAgent: 'Windows', shortcut: 'Ctrl+K', isInitialized: false },
  ])('shows the welcome action with $shortcut when initialized=$isInitialized', ({ userAgent, shortcut, isInitialized }) => {
    vi.stubGlobal('navigator', { userAgent });
    state.isInitialized = isInitialized;
    state.tabs = [];

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Sin sesión activa');
    expect(html).toContain('aria-label="Nueva sesión"');
    expect(html).toContain(`o pulsa ${shortcut} para buscar una sesión`);
  });
});
