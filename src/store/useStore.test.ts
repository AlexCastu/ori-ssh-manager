import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionGroup } from '../types';
import { useStore } from './useStore';

const group: SessionGroup = {
  id: 'group',
  name: 'Group',
  color: 'blue',
  icon: 'folder',
  isExpanded: true,
  order: 0,
};

vi.hoisted(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

describe('command audit settings', () => {
  it('disables command logging by default', () => {
    expect(useStore.getInitialState().settings.logCommands).toBe(false);
  });

  it('disables legacy command logging without losing persisted settings', async () => {
    const persistedState = {
      settings: {
        terminalTheme: 'nord-light',
        terminalFontSize: 'large',
        cursorStyle: 'underline',
        scrollback: 50000,
        logCommands: true,
      },
      sidebarCollapsed: true,
      sidebarWidth: 360,
      commandPanelCollapsed: true,
      terminalZoom: 1.2,
    };
    const { migrate, version } = useStore.persist.getOptions();

    const migrated = await migrate!(persistedState, 0);

    expect(version).toBe(1);
    expect(migrated).toEqual({
      ...persistedState,
      settings: { ...persistedState.settings, logCommands: false },
    });
  });

  it('preserves command logging enabled after migration', async () => {
    const persistedState = {
      settings: { ...useStore.getInitialState().settings, logCommands: true },
    };
    const { migrate } = useStore.persist.getOptions();

    expect(await migrate!(persistedState, 1)).toEqual(persistedState);
  });
});

describe('session groups', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    useStore.setState(useStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['root', null, undefined])(
    'reparents direct children to %s when deleting a group',
    async (parentId) => {
      const child = { ...group, id: 'child', parentId: group.id };
      const grandchild = { ...group, id: 'grandchild', parentId: child.id };
      const sibling = { ...group, id: 'sibling', parentId };
      useStore.setState({
        groups: [{ ...group, parentId }, child, grandchild, sibling],
      });

      await useStore.getState().deleteGroup(group.id);

      expect(invoke).toHaveBeenCalledWith('delete_group', { id: group.id });
      expect(useStore.getState().groups).toEqual([
        { ...child, parentId: parentId ?? null },
        grandchild,
        sibling,
      ]);
    }
  );

  it.each(['addGroup', 'updateGroup', 'toggleGroupExpanded', 'moveGroup'] as const)(
    'shows an error toast after an optimistic %s fails to persist',
    async (action) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockRejectedValue(new Error('save_group failed'));
      useStore.setState({ groups: [group, { ...group, id: 'sibling', order: 1 }] });
      const store = useStore.getState();

      if (action === 'addGroup') store.addGroup(group);
      if (action === 'updateGroup') store.updateGroup(group.id, { name: 'Renamed' });
      if (action === 'toggleGroupExpanded') store.toggleGroupExpanded(group.id);
      if (action === 'moveGroup') store.moveGroup(group.id, 'down');

      const optimisticGroups = useStore.getState().groups;
      expect(optimisticGroups).not.toEqual(store.groups);
      expect(useStore.getState().toasts).toEqual([]);
      await Promise.resolve();

      expect(invoke).toHaveBeenCalledWith('save_group', { group: expect.any(Object) });
      expect(console.error).toHaveBeenCalled();
      expect(useStore.getState().toasts).toEqual([
        expect.objectContaining({
          type: 'error',
          message: 'No se pudo guardar la carpeta',
        }),
      ]);
      expect(useStore.getState().groups).toEqual(optimisticGroups);
    }
  );
});

describe('terminal tab lifecycle', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    useStore.setState(useStore.getInitialState(), true);
  });

  it('keeps the active tab selection when creating, switching and closing tabs', async () => {
    const { createTab, setActiveTab, closeTab } = useStore.getState();
    const firstTabId = createTab('session');
    const secondTabId = createTab('session');
    expect(useStore.getState().activeTabId).toBe(secondTabId);

    setActiveTab(firstTabId);
    expect(useStore.getState().activeTabId).toBe(firstTabId);

    await closeTab(secondTabId);
    expect(useStore.getState().activeTabId).toBe(firstTabId);

    const thirdTabId = createTab('session');
    await closeTab(thirdTabId);
    expect(useStore.getState().activeTabId).toBe(firstTabId);

    await closeTab(firstTabId);
    expect(useStore.getState().activeTabId).toBeNull();
    expect(useStore.getState().tabs).toEqual([]);
  });

  it('clears channelId when a tab becomes disconnected', () => {
    const { createTab, updateTabStatus } = useStore.getState();
    const tabId = createTab('session');
    updateTabStatus(tabId, 'connected', 'channel');

    updateTabStatus(tabId, 'disconnected');

    expect(useStore.getState().tabs[0]).toMatchObject({ status: 'disconnected' });
    expect(useStore.getState().tabs[0].channelId).toBeUndefined();
  });

  it('keeps a tab created while closeTab waits for disconnection', async () => {
    let resolveDisconnect!: () => void;
    const disconnected = new Promise<void>((resolve) => {
      resolveDisconnect = resolve;
    });
    vi.mocked(invoke).mockImplementation((command) =>
      command === 'ssh_disconnect' ? disconnected : Promise.resolve()
    );
    const { createTab, updateTabStatus, closeTab } = useStore.getState();
    const tabId = createTab('session');
    updateTabStatus(tabId, 'connected', 'channel');

    const closing = closeTab(tabId);
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ssh_disconnect', { channelId: 'channel' });
    });
    const newTabId = createTab('session');
    resolveDisconnect();
    await closing;

    const { tabs, activeTabId } = useStore.getState();
    expect(tabs.map((tab) => tab.id)).toEqual([newTabId]);
    expect(activeTabId).toBe(newTabId);
  });
});
