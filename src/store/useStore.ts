import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type {
  AppStore,
  Session,
  SavedCommand,
  TerminalTab,
  ToastMessage,
  SessionGroup,
  AppSettings,
} from '../types';

// Generate unique IDs
const generateId = () => crypto.randomUUID();

// One-time migration: groups used to live only in zustand's localStorage
// persistence; now they live in SQLite. Read whatever an older version left.
function readLegacyGroupsFromLocalStorage(): SessionGroup[] {
  try {
    const raw = localStorage.getItem('ori-sshmanager-storage');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { groups?: unknown } };
    const groups = parsed?.state?.groups;
    return Array.isArray(groups) ? (groups as SessionGroup[]) : [];
  } catch {
    return [];
  }
}

// Default settings
const defaultSettings: AppSettings = {
  terminalTheme: 'nord-dark',
  appTheme: 'dark',
  terminalFontSize: 'medium',
  cursorStyle: 'block',
  scrollback: 10000,
  logCommands: true,
};

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ==================== STATE ====================
      isInitialized: false,

      // Sessions
      sessions: [],
      activeSessionId: null,

      // Session Groups
      groups: [],

      // Commands
      commands: [],

      // Terminals
      tabs: [],
      activeTabId: null,
      tabBuffers: {},

      // Settings
      settings: defaultSettings,

      // UI
      toasts: [],
      sessionModal: { isOpen: false },
      groupModal: { isOpen: false },
      commandModal: { isOpen: false },
      infoModal: { isOpen: false },
      settingsModal: { isOpen: false },
      commandPaletteOpen: false,
      sidebarCollapsed: false,
      sidebarWidth: 280,
      commandPanelCollapsed: false,
      terminalZoom: 1.0,

      // ==================== INITIALIZATION ====================
      initialize: async () => {
        try {
          await get().loadSessions();
          await get().loadGroups();
          await get().loadCommands();
          set({ isInitialized: true });
        } catch (error) {
          console.error('Failed to initialize:', error);
          get().addToast({
            type: 'error',
            title: 'Error',
            message: 'Failed to initialize application',
          });
        }
      },

      // ==================== SESSIONS ====================
      setActiveSession: (id) => set({ activeSessionId: id }),

      loadSessions: async () => {
        try {
          const sessions = await invoke<Session[]>('get_sessions');
          set({ sessions });
        } catch (error) {
          console.error('Failed to load sessions:', error);
          throw error;
        }
      },

      addSession: async (sessionData, showToast = true) => {
        const session: Session = {
          ...sessionData,
          authMethod: sessionData.authMethod || 'password',
          id: generateId(),
          createdAt: new Date().toISOString(),
        };

        try {
          await invoke('save_session', { session });
          set((state) => ({ sessions: [...state.sessions, session] }));
          if (showToast) {
            get().addToast({
              type: 'success',
              title: 'Session Created',
              message: `Session "${session.name}" has been saved`,
            });
          }
        } catch (error) {
          console.error('Failed to save session:', error);
          if (showToast) {
            get().addToast({
              type: 'error',
              title: 'Error',
              message: 'Failed to save session',
            });
          }
          throw error;
        }
      },

      updateSession: async (id, updates, showToast = true) => {
        const { sessions } = get();
        const existing = sessions.find((s) => s.id === id);
        if (!existing) return;

        const updated: Session = { ...existing, ...updates };

        try {
          await invoke('save_session', { session: updated });
          set((state) => ({
            sessions: state.sessions.map((s) => (s.id === id ? updated : s)),
          }));
          // Only show toast for meaningful updates (not just group changes)
          if (showToast && !('groupId' in updates && Object.keys(updates).length === 1)) {
            get().addToast({
              type: 'success',
              title: 'Session Updated',
              message: `Session "${updated.name}" has been updated`,
            });
          }
        } catch (error) {
          console.error('Failed to update session:', error);
          get().addToast({
            type: 'error',
            title: 'Error',
            message: 'Failed to update session',
          });
          throw error;
        }
      },

  deleteSession: async (id) => {
    try {
      await invoke('delete_session', { id });
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        commands: state.commands.filter((command) => command.sessionId !== id),
      }));
      get().addToast({
        type: 'success',
        title: 'Session Deleted',
        message: 'Session has been removed',
      });
    } catch (error) {
      console.error('Failed to delete session:', error);
      get().addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete session',
      });
      throw error;
    }
  },

  // ==================== COMMANDS ====================
  loadCommands: async (sessionId) => {
    try {
      const commands = await invoke<SavedCommand[]>('get_commands', {
        sessionId: sessionId || null,
      });
      set({ commands });
    } catch (error) {
      console.error('Failed to load commands:', error);
      throw error;
    }
  },

  addCommand: async (commandData) => {
    const command: SavedCommand = {
      ...commandData,
      id: generateId(),
    };

    try {
      await invoke('save_command', { command });
      set((state) => ({ commands: [...state.commands, command] }));
      get().addToast({
        type: 'success',
        title: 'Command Saved',
        message: `Command "${command.name}" has been saved`,
      });
    } catch (error) {
      console.error('Failed to save command:', error);
      get().addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to save command',
      });
      throw error;
    }
  },

  deleteCommand: async (id) => {
    try {
      await invoke('delete_command', { id });
      set((state) => ({
        commands: state.commands.filter((c) => c.id !== id),
      }));
      get().addToast({
        type: 'success',
        title: 'Command Deleted',
        message: 'Command has been removed',
      });
    } catch (error) {
      console.error('Failed to delete command:', error);
      get().addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete command',
      });
      throw error;
    }
  },

  updateCommand: async (id, updates) => {
    const { commands } = get();
    const existing = commands.find((c) => c.id === id);
    if (!existing) return;

    const updated: SavedCommand = { ...existing, ...updates };

    try {
      await invoke('save_command', { command: updated });
      set((state) => ({
        commands: state.commands.map((c) => (c.id === id ? updated : c)),
      }));
      get().addToast({
        type: 'success',
        title: 'Command Updated',
        message: `Command "${updated.name}" has been updated`,
      });
    } catch (error) {
      console.error('Failed to update command:', error);
      get().addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to update command',
      });
      throw error;
    }
  },

  // ==================== TERMINALS ====================
  createTab: (sessionId) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    const tabId = generateId();

    const newTab: TerminalTab = {
      id: tabId,
      sessionId,
      title: session?.name || 'New Tab',
      isActive: true,
      status: 'idle',
    };

    set((state) => ({
      tabs: [...state.tabs.map((t) => ({ ...t, isActive: false })), newTab],
      activeTabId: tabId,
    }));

    return tabId;
  },

  closeTab: async (tabId) => {
    const { tabs, activeTabId } = get();
    const tabToClose = tabs.find((t) => t.id === tabId);

    // Disconnect through sshService so its per-channel state (callbacks,
    // reconnect timers, input buffers) is cleaned up too.
    // Dynamic import avoids a static circular dependency.
    if (tabToClose?.channelId) {
      try {
        const { sshService } = await import('../hooks/sshService');
        await sshService.disconnect(tabId, tabToClose.channelId);
      } catch (error) {
        console.error('Failed to disconnect:', error);
      }
    }

    const filtered = tabs.filter((t) => t.id !== tabId);

    let newActiveTabId = activeTabId;
    if (activeTabId === tabId) {
      newActiveTabId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
    }

    set({
      tabs: filtered.map((t) => ({
        ...t,
        isActive: t.id === newActiveTabId,
      })),
      activeTabId: newActiveTabId,
      tabBuffers: Object.fromEntries(
        Object.entries(get().tabBuffers).filter(([id]) => id !== tabId)
      ),
    });
  },

  setActiveTab: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId,
    }));
  },

  updateTabStatus: (tabId, status, channelId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, status, channelId: channelId ?? t.channelId } : t
      ),
    }));
  },

  setTabBuffer: (tabId, text) => {
    set((state) => ({
      tabBuffers: { ...state.tabBuffers, [tabId]: text },
    }));
  },

  appendTabBuffer: (tabId, chunk) => {
    set((state) => ({
      tabBuffers: { ...state.tabBuffers, [tabId]: `${state.tabBuffers[tabId] ?? ''}${chunk}` },
    }));
  },

  getTabBuffer: (tabId) => {
    return get().tabBuffers[tabId];
  },

  // ==================== UI ====================
  addToast: (toast) => {
    const { toasts } = get();

    // Prevent duplicate toasts with same title and message within 2 seconds
    const isDuplicate = toasts.some(
      (t) => t.title === toast.title && t.message === toast.message
    );

    if (isDuplicate) {
      return; // Don't add duplicate toast
    }

    const id = generateId();
    const newToast: ToastMessage = { ...toast, id };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    // Auto-remove after duration
    const duration = toast.duration ?? 4000;
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  openSessionModal: (data) => {
    set({ sessionModal: { isOpen: true, data } });
  },

  closeSessionModal: () => {
    set({ sessionModal: { isOpen: false } });
  },

  openGroupModal: (data) => {
    set({ groupModal: { isOpen: true, data } });
  },

  closeGroupModal: () => {
    set({ groupModal: { isOpen: false } });
  },

  openCommandModal: (data) => {
    set({ commandModal: { isOpen: true, data } });
  },

  closeCommandModal: () => {
    set({ commandModal: { isOpen: false } });
  },

  openInfoModal: (data) => {
    set({ infoModal: { isOpen: true, data } });
  },

  closeInfoModal: () => {
    set({ infoModal: { isOpen: false } });
  },

  openSettingsModal: () => {
    set({ settingsModal: { isOpen: true } });
  },

  closeSettingsModal: () => {
    set({ settingsModal: { isOpen: false } });
  },

  toggleCommandPalette: () => {
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }));
  },

  closeCommandPalette: () => {
    set({ commandPaletteOpen: false });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setSidebarWidth: (width) => {
    // Clamp so the sidebar can't be dragged uselessly thin or huge
    set({ sidebarWidth: Math.max(220, Math.min(560, width)) });
  },

  toggleCommandPanel: () => {
    set((state) => ({ commandPanelCollapsed: !state.commandPanelCollapsed }));
  },

  setTerminalZoom: (zoom) => {
    // Clamp between 0.7 and 1.5
    const clampedZoom = Math.max(0.7, Math.min(1.5, zoom));
    set({ terminalZoom: clampedZoom });
  },

  // ==================== SESSION GROUPS ====================
  // Groups live in SQLite (like the sessions that reference them).
  loadGroups: async () => {
    try {
      let groups = await invoke<SessionGroup[]>('get_groups');
      if (groups.length === 0) {
        const legacy = readLegacyGroupsFromLocalStorage();
        if (legacy.length > 0) {
          await Promise.all(legacy.map((group) => invoke('save_group', { group })));
          groups = legacy;
          console.info(`Migrated ${legacy.length} groups from localStorage to SQLite`);
        }
      }
      set({ groups });
    } catch (error) {
      console.error('Failed to load groups:', error);
      throw error;
    }
  },

  addGroup: (groupData) => {
    const { groups } = get();
    const group: SessionGroup = {
      ...groupData,
      id: generateId(),
      order: groups.length,
    };
    set((state) => ({ groups: [...state.groups, group] }));
    invoke('save_group', { group }).catch((error) =>
      console.error('Failed to persist group:', error)
    );
    return group.id;
  },

  updateGroup: (id, updates) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }));
    const group = get().groups.find((g) => g.id === id);
    if (group) {
      invoke('save_group', { group }).catch((error) =>
        console.error('Failed to persist group:', error)
      );
    }
  },

  deleteGroup: async (id) => {
    const group = get().groups.find((g) => g.id === id);
    if (!group) return;

    try {
      await invoke('delete_group', { id });
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        sessions: state.sessions.map((s) =>
          s.groupId === id ? { ...s, groupId: null } : s
        ),
      }));
      get().addToast({
        type: 'success',
        title: 'Group Deleted',
        message: `Group "${group.name}" has been removed`,
      });
    } catch (error) {
      console.error('Failed to delete group:', error);
      get().addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete group',
      });
      throw error;
    }
  },

  toggleGroupExpanded: (id) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === id ? { ...g, isExpanded: !g.isExpanded } : g
      ),
    }));
    const group = get().groups.find((g) => g.id === id);
    if (group) {
      invoke('save_group', { group }).catch((error) =>
        console.error('Failed to persist group:', error)
      );
    }
  },

  moveGroup: (id, direction) => {
    const { groups } = get();
    const target = groups.find((g) => g.id === id);
    if (!target) return;

    const parentId = target.parentId ?? null;
    // Siblings in their current visual order (stable sort on `order`).
    const siblings = groups
      .filter((g) => (g.parentId ?? null) === parentId)
      .sort((a, b) => a.order - b.order);

    const index = siblings.findIndex((g) => g.id === id);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= siblings.length) return; // already at edge

    // Reorder the sibling list, then normalize `order` to 0..n so the values
    // are always sequential (existing data can have duplicate/gappy orders).
    [siblings[index], siblings[swapWith]] = [siblings[swapWith], siblings[index]];
    const orderById = new Map(siblings.map((g, i) => [g.id, i]));

    const changed: SessionGroup[] = [];
    set((state) => ({
      groups: state.groups.map((g) => {
        if (!orderById.has(g.id) || g.order === orderById.get(g.id)) return g;
        const updated = { ...g, order: orderById.get(g.id)! };
        changed.push(updated);
        return updated;
      }),
    }));

    changed.forEach((group) =>
      invoke('save_group', { group }).catch((error) =>
        console.error('Failed to persist group order:', error)
      )
    );
  },

  // ==================== SETTINGS ====================
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },
}),
    {
      name: 'ori-sshmanager-storage',
      // Groups are NOT persisted here anymore: they live in SQLite
      partialize: (state) => ({
        settings: state.settings,
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
        commandPanelCollapsed: state.commandPanelCollapsed,
        terminalZoom: state.terminalZoom,
      }),
    }
  )
);
