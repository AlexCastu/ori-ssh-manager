// Singleton SSH Service - handles all SSH connections and events
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import type { Session, ConnectParams } from '../types';

interface PtyOutputPayload {
  channelId: string;
  data: string;
}

class SSHService {
  private static instance: SSHService;
  private callbacks = new Map<string, (data: string) => void>();
  private initialized = false;
  private outputUnlisten: (() => void) | null = null;
  private closedUnlisten: (() => void) | null = null;

  private constructor() {}

  static getInstance(): SSHService {
    if (!SSHService.instance) {
      SSHService.instance = new SSHService();
    }
    return SSHService.instance;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('SSHService: Initializing global listeners');

    // Listen for PTY output - ONCE globally
    this.outputUnlisten = await listen<PtyOutputPayload>('pty_output', (event) => {
      const { channelId, data } = event.payload;
      const callback = this.callbacks.get(channelId);
      if (callback) {
        callback(data);
      }
    });

    // Listen for PTY closed events - ONCE globally
    this.closedUnlisten = await listen<string>('pty_closed', (event) => {
      const channelId = event.payload;
      const { tabs, updateTabStatus } = useStore.getState();
      const tab = tabs.find(t => t.channelId === channelId);
      if (tab) {
        updateTabStatus(tab.id, 'disconnected');
      }
      this.callbacks.delete(channelId);
    });
  }

  async connect(
    tabId: string,
    session: Session,
    cols?: number,
    rows?: number
  ): Promise<string | null> {
    const { updateTabStatus, addToast } = useStore.getState();
    updateTabStatus(tabId, 'connecting');

    const params: ConnectParams = {
      host: session.host,
      port: session.port,
      username: session.username,
      password: session.password || '',
      jumpHost: session.jumpHost,
      jumpPort: session.jumpPort,
      jumpUsername: session.jumpUsername,
      jumpPassword: session.jumpPassword,
      cols,
      rows,
    };

    try {
      const channelId = await invoke<string>('ssh_connect', { params });
      updateTabStatus(tabId, 'connected', channelId);
      addToast({
        type: 'success',
        title: 'Connected',
        message: `Connected to ${session.name}`,
      });
      return channelId;
    } catch (error) {
      console.error('SSH connection failed:', error);
      updateTabStatus(tabId, 'error');
      addToast({
        type: 'error',
        title: 'Connection Failed',
        message: String(error),
      });
      return null;
    }
  }

  async send(channelId: string, data: string) {
    const { addToast } = useStore.getState();
    try {
      await invoke('ssh_send', { channelId, data });
    } catch (error) {
      console.error('Failed to send:', error);
      addToast({
        type: 'error',
        title: 'Envío fallido',
        message: 'No se pudo enviar datos al servidor',
        duration: 2500,
      });
    }
  }

  startReading(channelId: string, onData: (data: string) => void) {
    this.callbacks.set(channelId, onData);
  }

  stopReading(channelId: string) {
    this.callbacks.delete(channelId);
  }

  async resize(channelId: string, cols: number, rows: number) {
    const { addToast } = useStore.getState();
    try {
      await invoke('ssh_resize', { channelId, cols, rows });
    } catch (error) {
      console.error('Failed to resize:', error);
      addToast({
        type: 'error',
        title: 'Error de redimensionado',
        message: 'No se pudo ajustar el tamaño del terminal',
        duration: 2500,
      });
    }
  }

  async disconnect(tabId: string, channelId: string) {
    const { updateTabStatus, addToast } = useStore.getState();
    try {
      await invoke('ssh_disconnect', { channelId });
      this.callbacks.delete(channelId);
      updateTabStatus(tabId, 'disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      addToast({
        type: 'error',
        title: 'Error al desconectar',
        message: 'No se pudo cerrar la sesión SSH',
        duration: 2500,
      });
    }
  }

  cleanup() {
    this.outputUnlisten?.();
    this.closedUnlisten?.();
    this.callbacks.clear();
    this.initialized = false;
  }
}

// Export singleton instance
export const sshService = SSHService.getInstance();
