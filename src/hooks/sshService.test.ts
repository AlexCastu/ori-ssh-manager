import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store/useStore';
import type { Session } from '../types';
import { sshService } from './sshService';

const session: Session = {
  id: 'session',
  name: 'Session',
  host: 'example.test',
  port: 22,
  username: 'user',
  authMethod: 'agent',
  color: 'blue',
  createdAt: '2026-11-14T00:00:00.000Z',
};

vi.hoisted(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

describe('SSH connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    useStore.setState(useStore.getInitialState(), true);
  });

  afterEach(() => {
    sshService.cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('disconnects a channel returned after its tab was closed and returns null', async () => {
    let resolveConnect!: (channelId: string) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveConnect = resolve;
    }));
    const tabId = useStore.getState().createTab(session.id);

    const connecting = sshService.connect(tabId, session, 80, 24);
    await useStore.getState().closeTab(tabId);
    resolveConnect('orphan-channel');
    const channelId = await connecting;

    expect(invoke).toHaveBeenCalledWith('ssh_disconnect', { channelId: 'orphan-channel' });
    expect(channelId).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith('add_session_log', expect.anything());
    expect(useStore.getState().toasts).toEqual([]);
    expect(useStore.getState().tabs).toEqual([]);
  });
});
