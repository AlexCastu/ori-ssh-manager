import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

class LocalTerminalService {
  private static instance: LocalTerminalService;
  private channelListeners = new Map<string, () => void>();

  static getInstance(): LocalTerminalService {
    if (!LocalTerminalService.instance) {
      LocalTerminalService.instance = new LocalTerminalService();
    }
    return LocalTerminalService.instance;
  }

  async spawn(cols: number, rows: number): Promise<string | null> {
    try {
      const channelId = await invoke<string>('local_pty_spawn', { cols, rows });
      return channelId;
    } catch (error) {
      console.error('Local PTY spawn failed', error);
      return null;
    }
  }

  async send(channelId: string, data: string): Promise<void> {
    await invoke('local_pty_write', { channelId, data });
  }

  async resize(channelId: string, cols: number, rows: number): Promise<void> {
    await invoke('local_pty_resize', { channelId, cols, rows });
  }

  async readBuffer(channelId: string): Promise<string> {
    try {
      return await invoke<string>('local_pty_read_buffer', { channelId });
    } catch (error) {
      console.error('Local PTY read buffer failed', error);
      return '';
    }
  }

  async kill(channelId: string): Promise<void> {
    await invoke('local_pty_kill', { channelId });
  }

  async startReading(channelId: string, onData: (data: string) => void): Promise<void> {
    const existing = this.channelListeners.get(channelId);
    if (existing) {
      existing();
      this.channelListeners.delete(channelId);
    }
    const unlisten = await listen<string>(`local-output-${channelId}`, (event) => {
      onData(event.payload);
    });
    this.channelListeners.set(channelId, unlisten);
  }

  stopReading(channelId: string): void {
    const unlisten = this.channelListeners.get(channelId);
    if (unlisten) {
      unlisten();
      this.channelListeners.delete(channelId);
    }
  }
}

export const localTerminalService = LocalTerminalService.getInstance();
