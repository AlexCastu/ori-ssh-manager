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

// Default settings
const defaultSettings: AppSettings = {
  terminalTheme: 'nord-dark',
  appTheme: 'dark',
  showPasswords: false,
  terminalFontSize: 'medium',
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
      commandModal: { isOpen: false },
      settingsModal: { isOpen: false },
      sidebarCollapsed: false,

      // ==================== INITIALIZATION ====================
      initialize: async () => {
        try {
          await get().loadSessions();
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

      addSession: async (sessionData) => {
        const session: Session = {
          ...sessionData,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };

        try {
          await invoke('save_session', { session });
          set((state) => ({ sessions: [...state.sessions, session] }));
          get().addToast({
            type: 'success',
            title: 'Session Created',
            message: `Session "${session.name}" has been saved`,
          });
        } catch (error) {
          console.error('Failed to save session:', error);
          get().addToast({
            type: 'error',
            title: 'Error',
            message: 'Failed to save session',
          });
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

    // Disconnect SSH session if connected
    if (tabToClose?.channelId) {
      try {
        await invoke('disconnect', { channelId: tabToClose.channelId });
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

  openCommandModal: (data) => {
    set({ commandModal: { isOpen: true, data } });
  },

  closeCommandModal: () => {
    set({ commandModal: { isOpen: false } });
  },

  openSettingsModal: () => {
    set({ settingsModal: { isOpen: true } });
  },

  closeSettingsModal: () => {
    set({ settingsModal: { isOpen: false } });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  // ==================== SESSION GROUPS ====================
  addGroup: (groupData) => {
    const { groups } = get();
    const group: SessionGroup = {
      ...groupData,
      id: generateId(),
      order: groups.length,
    };
    set((state) => ({ groups: [...state.groups, group] }));
  },

  updateGroup: (id, updates) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }));
  },

  deleteGroup: (id) => {
    // Cuando eliminamos un grupo, las sesiones de ese grupo quedan sin grupo
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
      sessions: state.sessions.map((s) =>
        s.groupId === id ? { ...s, groupId: null } : s
      ),
    }));
  },

  toggleGroupExpanded: (id) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === id ? { ...g, isExpanded: !g.isExpanded } : g
      ),
    }));
  },

  reorderSessions: (_groupId, sessionIds) => {
    // This updates the order of sessions in state
    // For now, just reorder in memory - can be persisted later
    set((state) => {
      const reorderedSessions = sessionIds
        .map((id) => state.sessions.find((s) => s.id === id))
        .filter((s): s is Session => s !== undefined);

      const otherSessions = state.sessions.filter(
        (s) => !sessionIds.includes(s.id)
      );

      return {
        sessions: [...otherSessions, ...reorderedSessions],
      };
    });
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
      partialize: (state) => ({
        groups: state.groups,
        settings: state.settings,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
