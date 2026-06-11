// Types for ORI-SSHManager

// ==================== DATABASE TYPES ====================

export interface SessionGroup {
  id: string;
  name: string;
  color: SessionColor;
  isExpanded: boolean;
  order: number;
}

export type AuthMethod = 'password' | 'key' | 'agent';

// One hop of the jump chain (bastion). Secrets never come back from the
// backend: empty on edit means "keep the stored value".
export interface JumpHop {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
}

export interface Session {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  password?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  jumpHops?: JumpHop[];
  color: SessionColor;
  groupId?: string | null;
  createdAt: string;
}

export type SessionColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'red'
  | 'cyan'
  | 'pink'
  | 'yellow';

export type TerminalTheme = 'nord-dark' | 'nord-light';

export type AppTheme = 'light' | 'dark' | 'system';

export interface AppSettings {
  terminalTheme: TerminalTheme;
  appTheme: AppTheme;
  terminalFontSize?: TerminalFontSize;
  cursorStyle?: TerminalCursorStyle;
  scrollback?: TerminalScrollback;
}

export type TerminalFontSize = 'small' | 'medium' | 'large';

export type TerminalCursorStyle = 'block' | 'bar' | 'underline';

export type TerminalScrollback = 1000 | 10000 | 50000;

export interface SavedCommand {
  id: string;
  sessionId?: string;
  name: string;
  command: string;
}

// ==================== SSH CONNECTION TYPES ====================

// Credentials never cross IPC: the backend loads them from the DB by id.
// progressId (the tab id) is echoed back on ssh_progress events (multi-hop).
export interface ConnectParams {
  sessionId: string;
  cols?: number;
  rows?: number;
  progressId?: string;
}

export interface SSHConnection {
  channelId: string;
  sessionId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

// ==================== TERMINAL TYPES ====================

export interface TerminalTab {
  id: string;
  sessionId: string;
  channelId?: string;
  title: string;
  isActive: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
}

export interface TabBuffersState {
  tabBuffers: Record<string, string>;
  setTabBuffer: (tabId: string, text: string) => void;
  appendTabBuffer: (tabId: string, chunk: string) => void;
  getTabBuffer: (tabId: string) => string | undefined;
}

// ==================== UI STATE TYPES ====================

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  // Optional inline action (e.g. "forget host key" after a mismatch)
  action?: { label: string; onClick: () => void };
}

export interface ModalState {
  isOpen: boolean;
  data?: unknown;
}

// ==================== STORE TYPES ====================

export interface SessionGroupsSlice {
  groups: SessionGroup[];
  loadGroups: () => Promise<void>;
  addGroup: (group: Omit<SessionGroup, 'id' | 'order'>) => string;
  updateGroup: (id: string, group: Partial<SessionGroup>) => void;
  deleteGroup: (id: string) => void;
  toggleGroupExpanded: (id: string) => void;
  reorderSessions: (groupId: string | null, sessionIds: string[]) => void;
}

export interface SessionsSlice {
  sessions: Session[];
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Omit<Session, 'id' | 'createdAt'>, showToast?: boolean) => Promise<void>;
  updateSession: (id: string, session: Partial<Session>, showToast?: boolean) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  loadSessions: () => Promise<void>;
}

export interface CommandsSlice {
  commands: SavedCommand[];
  addCommand: (command: Omit<SavedCommand, 'id'>) => Promise<void>;
  updateCommand: (id: string, updates: Partial<Omit<SavedCommand, 'id'>>) => Promise<void>;
  deleteCommand: (id: string) => Promise<void>;
  loadCommands: (sessionId?: string) => Promise<void>;
}

export interface TerminalsSlice {
  tabs: TerminalTab[];
  activeTabId: string | null;
  createTab: (sessionId: string) => string;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  updateTabStatus: (tabId: string, status: TerminalTab['status'], channelId?: string) => void;
}

export interface UISlice {
  toasts: ToastMessage[];
  sessionModal: ModalState & { data?: { session?: Session; mode: 'create' | 'edit' } };
  commandModal: ModalState & { data?: { command?: SavedCommand; mode?: 'create' | 'edit' } };
  settingsModal: ModalState;
  sidebarCollapsed: boolean;
  commandPanelCollapsed: boolean;
  terminalZoom: number; // 0.8 to 1.5 multiplier
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  openSessionModal: (data: { session?: Session; mode: 'create' | 'edit' }) => void;
  closeSessionModal: () => void;
  openCommandModal: (data?: { command?: SavedCommand; mode?: 'create' | 'edit' }) => void;
  closeCommandModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  toggleSidebar: () => void;
  toggleCommandPanel: () => void;
  setTerminalZoom: (zoom: number) => void;
}

export interface SettingsSlice {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
}

export type AppStore = SessionsSlice & SessionGroupsSlice & CommandsSlice & TerminalsSlice & UISlice & SettingsSlice & {
  isInitialized: boolean;
  initialize: () => Promise<void>;
} & TabBuffersState;
