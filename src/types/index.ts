// Types for ORI-SSHManager

// ==================== DATABASE TYPES ====================

export interface SessionGroup {
  id: string;
  name: string;
  color: SessionColor;
  // Icon name from the shared icon registry (utils/icons). 'folder' default.
  icon: string;
  isExpanded: boolean;
  order: number;
  // Parent group id for nested folders; null/undefined = top level.
  parentId?: string | null;
  // Optional free-text notes/comments.
  notes?: string | null;
}

export type AuthMethod = 'password' | 'key' | 'agent';

// One hop of the jump chain. Secrets never come back from the backend: empty
// on edit means "keep the stored value".
export interface JumpHop {
  // Optional human label to identify the jump host in the session map.
  name?: string | null;
  // When set, this hop is a live reference to another saved session flagged
  // `usableAsJump`. Connection fields are resolved from it; inline stay blank.
  refSessionId?: string | null;
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
  // When true this session can be picked as a jump host by other sessions.
  usableAsJump?: boolean;
  color: SessionColor;
  // Optional icon name; when absent the sidebar shows the colored dot.
  icon?: string | null;
  // Optional free-text notes/comments.
  notes?: string | null;
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
  // Audit: capture launched commands in the session log (events are always
  // logged). Default on; the password-prompt guard skips secret input.
  logCommands?: boolean;
}

// ==================== SESSION AUDIT LOG ====================

export type SessionLogKind = 'event' | 'command';

export interface SessionLog {
  id: string;
  sessionId: string;
  // ISO-8601 timestamp generated on the frontend.
  ts: string;
  kind: SessionLogKind;
  message: string;
}

export type TerminalFontSize = 'small' | 'medium' | 'large';

export type TerminalCursorStyle = 'block' | 'bar' | 'underline';

export type TerminalScrollback = 1000 | 10000 | 50000;

export interface SavedCommand {
  id: string;
  sessionId?: string;
  name: string;
  command: string;
  // Optional free-text notes/description.
  notes?: string | null;
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
  deleteGroup: (id: string) => Promise<void>;
  toggleGroupExpanded: (id: string) => void;
  // Move a folder up/down among its siblings (same parentId). Reassigns
  // sequential `order` to the sibling set and persists the changed ones.
  moveGroup: (id: string, direction: 'up' | 'down') => void;
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
  groupModal: ModalState & { data?: { group?: SessionGroup; mode: 'create' | 'edit'; parentId?: string | null } };
  commandModal: ModalState & { data?: { command?: SavedCommand; mode?: 'create' | 'edit' } };
  infoModal: ModalState & { data?: { session: Session } };
  settingsModal: ModalState;
  commandPaletteOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number; // expanded width in px (resizable)
  commandPanelCollapsed: boolean;
  terminalZoom: number; // 0.8 to 1.5 multiplier
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  openSessionModal: (data: { session?: Session; mode: 'create' | 'edit' }) => void;
  closeSessionModal: () => void;
  openGroupModal: (data: { group?: SessionGroup; mode: 'create' | 'edit'; parentId?: string | null }) => void;
  closeGroupModal: () => void;
  openCommandModal: (data?: { command?: SavedCommand; mode?: 'create' | 'edit' }) => void;
  closeCommandModal: () => void;
  openInfoModal: (data: { session: Session }) => void;
  closeInfoModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  toggleCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
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
