// Singleton SSH Service - handles all SSH connections and events
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import type { Session, ConnectParams } from '../types';

interface PtyOutputPayload {
  channelId: string;
  data: string;
}

interface PtyClosedPayload {
  channelId: string;
  reason?: 'normal' | 'error';
  exitStatus?: number | null;
}

interface SshProgressPayload {
  progressId: string;
  message: string;
}

interface ReconnectConfig {
  tabId: string;
  session: Session;
  cols: number;
  rows: number;
  onData: (data: string) => void;
}

// Error type classification for better UX
function classifyError(error: string): { title: string; message: string } {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('host key')) {
    return {
      title: 'Host Key Verification Failed',
      message: error,
    };
  }
  if (errorLower.includes('auth') || errorLower.includes('permission denied')) {
    return {
      title: 'Authentication Failed',
      message: 'Invalid username, password, or SSH key. Please check your credentials.',
    };
  }
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      title: 'Connection Timeout',
      message: 'Server took too long to respond. Check if the host is reachable.',
    };
  }
  if (errorLower.includes('refused') || errorLower.includes('connection refused')) {
    return {
      title: 'Connection Refused',
      message: 'Server refused the connection. Verify the port and firewall settings.',
    };
  }
  if (errorLower.includes('unreachable') || errorLower.includes('no route')) {
    return {
      title: 'Host Unreachable',
      message: 'Cannot reach the server. Check network connectivity.',
    };
  }
  if (errorLower.includes('key') && errorLower.includes('not found')) {
    return {
      title: 'SSH Key Not Found',
      message: 'The specified private key file does not exist.',
    };
  }
  if (errorLower.includes('dns') || errorLower.includes('resolve')) {
    return {
      title: 'DNS Resolution Failed',
      message: 'Could not resolve hostname. Check the server address.',
    };
  }

  return {
    title: 'Connection Failed',
    message: error,
  };
}

class SSHService {
  private static instance: SSHService;
  private callbacks = new Map<string, (data: string) => void>();
  // Multi-hop connection progress, keyed by tab id
  private progressCallbacks = new Map<string, (message: string) => void>();
  private reconnectConfigs = new Map<string, ReconnectConfig>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private intentionalCloseChannels = new Set<string>();
  private inputBuffers = new Map<string, string>();
  private initialized = false;
  private outputUnlisten: (() => void) | null = null;
  private closedUnlisten: (() => void) | null = null;
  private progressUnlisten: (() => void) | null = null;

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

    // Listen for PTY output
    this.outputUnlisten = await listen<PtyOutputPayload>('pty_output', (event) => {
      const { channelId, data } = event.payload;
      const callback = this.callbacks.get(channelId);
      if (callback) {
        callback(data);
      }
    });

    // Multi-hop connection progress ("Hop 1/2: connecting to ...")
    this.progressUnlisten = await listen<SshProgressPayload>('ssh_progress', (event) => {
      const { progressId, message } = event.payload;
      this.progressCallbacks.get(progressId)?.(message);
    });

    // Listen for PTY closed events - trigger auto-reconnect only for unexpected closures
    this.closedUnlisten = await listen<PtyClosedPayload | string>('pty_closed', (event) => {
      const closed = this.normalizeClosedPayload(event.payload);
      const { channelId } = closed;
      const { tabs, updateTabStatus, addToast } = useStore.getState();
      const tab = tabs.find(t => t.channelId === channelId);

      if (tab) {
        updateTabStatus(tab.id, 'disconnected');

        const isIntentionalClose =
          closed.reason === 'normal' || this.intentionalCloseChannels.has(channelId);

        if (isIntentionalClose) {
          this.disableAutoReconnect(tab.id);
        }

        // Check if auto-reconnect is configured for this tab and the close was unexpected
        const config = this.reconnectConfigs.get(tab.id);
        if (config && !isIntentionalClose) {
          addToast({
            type: 'warning',
            title: 'Connection Lost',
            message: 'Attempting to reconnect...',
            duration: 3000,
          });
          this.scheduleReconnect(tab.id, 1);
        }
      }
      this.callbacks.delete(channelId);
      this.intentionalCloseChannels.delete(channelId);
      this.inputBuffers.delete(channelId);
    });
  }

  private normalizeClosedPayload(payload: PtyClosedPayload | string): PtyClosedPayload {
    if (typeof payload === 'string') {
      return { channelId: payload, reason: 'error', exitStatus: null };
    }

    return {
      channelId: payload.channelId,
      reason: payload.reason ?? 'error',
      exitStatus: payload.exitStatus ?? null,
    };
  }

  private trackPotentialLogout(channelId: string, data: string) {
    if (data.includes('\x04')) {
      this.intentionalCloseChannels.add(channelId);
      return;
    }

    let buffer = this.inputBuffers.get(channelId) ?? '';

    for (const char of data) {
      if (char === '\r' || char === '\n') {
        const command = buffer.trim();
        if (command === 'logout' || command === 'exit' || command.startsWith('exit ')) {
          this.intentionalCloseChannels.add(channelId);
        }
        buffer = '';
      } else if (char === '\b' || char === '\x7f') {
        buffer = buffer.slice(0, -1);
      } else if (char >= ' ') {
        buffer += char;
      }
    }

    this.inputBuffers.set(channelId, buffer.slice(-256));
  }

  // Subscribe to multi-hop connection progress for a tab
  onProgress(tabId: string, callback: (message: string) => void) {
    this.progressCallbacks.set(tabId, callback);
  }

  offProgress(tabId: string) {
    this.progressCallbacks.delete(tabId);
  }

  // Enable auto-reconnect for a tab
  enableAutoReconnect(tabId: string, session: Session, cols: number, rows: number, onData: (data: string) => void) {
    this.reconnectConfigs.set(tabId, { tabId, session, cols, rows, onData });
  }

  // Disable auto-reconnect for a tab
  disableAutoReconnect(tabId: string) {
    this.reconnectConfigs.delete(tabId);
    const timer = this.reconnectTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(tabId);
    }
  }

  private scheduleReconnect(tabId: string, attempt: number) {
    const maxAttempts = 5;
    if (attempt > maxAttempts) {
      const { addToast } = useStore.getState();
      addToast({
        type: 'error',
        title: 'Reconnection Failed',
        message: `Could not reconnect after ${maxAttempts} attempts.`,
        duration: 5000,
      });
      this.disableAutoReconnect(tabId);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);

    const timer = setTimeout(async () => {
      const config = this.reconnectConfigs.get(tabId);
      if (!config) return;

      const { updateTabStatus, addToast } = useStore.getState();
      updateTabStatus(tabId, 'connecting');

      const channelId = await this.connect(tabId, config.session, config.cols, config.rows);

      if (channelId) {
        this.startReading(channelId, config.onData);
        addToast({
          type: 'success',
          title: 'Reconnected',
          message: `Successfully reconnected to ${config.session.name}`,
        });
      } else {
        // Try again
        this.scheduleReconnect(tabId, attempt + 1);
      }
    }, delay);

    this.reconnectTimers.set(tabId, timer);
  }

  async connect(
    tabId: string,
    session: Session,
    cols?: number,
    rows?: number
  ): Promise<string | null> {
    const { updateTabStatus, addToast } = useStore.getState();
    updateTabStatus(tabId, 'connecting');

    // Only the id travels over IPC: the backend resolves credentials internally
    const params: ConnectParams = {
      sessionId: session.id,
      cols,
      rows,
      progressId: tabId,
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

      const errorText = String(error);
      const errorInfo = classifyError(errorText);
      addToast({
        type: 'error',
        title: errorInfo.title,
        message: errorInfo.message,
        duration: errorInfo.title === 'Host Key Verification Failed' ? 12000 : 5000,
        action: this.buildHostKeyAction(errorText),
      });
      return null;
    }
  }

  /// When the failure is a host key mismatch, offer to forget the stored key
  /// (the offending host:port is parsed from the backend error, so this also
  /// works when the mismatch happens on a jump hop)
  private buildHostKeyAction(errorText: string) {
    const match = errorText.match(/Host key for ([^\s:]+):(\d+) CHANGED/i);
    if (!match) return undefined;

    const [, host, port] = match;
    return {
      label: `Olvidar clave de ${host}`,
      onClick: () => {
        invoke<boolean>('forget_host_key', { host, port: Number(port) })
          .then((removed) => {
            useStore.getState().addToast({
              type: removed ? 'success' : 'warning',
              title: removed ? 'Host key olvidada' : 'Sin cambios',
              message: removed
                ? 'Pulsa Reconectar para confiar en la nueva clave.'
                : 'No se encontró la entrada en known_hosts.',
            });
          })
          .catch((err) => {
            console.error('forget_host_key failed:', err);
            useStore.getState().addToast({
              type: 'error',
              title: 'Error',
              message: 'No se pudo eliminar la host key',
            });
          });
      },
    };
  }

  async send(channelId: string, data: string) {
    const { addToast } = useStore.getState();
    try {
      this.trackPotentialLogout(channelId, data);
      await invoke('ssh_send', { channelId, data });
    } catch (error) {
      console.error('Failed to send:', error);
      addToast({
        type: 'error',
        title: 'Send Failed',
        message: 'Could not send data to server',
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
    try {
      await invoke('ssh_resize', { channelId, cols, rows });
    } catch (error) {
      console.error('Failed to resize:', error);
    }
  }

  async disconnect(tabId: string, channelId: string) {
    const { updateTabStatus } = useStore.getState();

    // Disable auto-reconnect when manually disconnecting
    this.disableAutoReconnect(tabId);

    try {
      await invoke('ssh_disconnect', { channelId });
      this.callbacks.delete(channelId);
      this.intentionalCloseChannels.delete(channelId);
      this.inputBuffers.delete(channelId);
      updateTabStatus(tabId, 'disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  cleanup() {
    this.outputUnlisten?.();
    this.closedUnlisten?.();
    this.progressUnlisten?.();
    this.callbacks.clear();
    this.progressCallbacks.clear();
    this.reconnectConfigs.clear();
    this.intentionalCloseChannels.clear();
    this.inputBuffers.clear();
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.initialized = false;
  }
}

// Export singleton instance
export const sshService = SSHService.getInstance();
