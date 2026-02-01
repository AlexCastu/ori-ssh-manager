// Singleton SSH Service - handles all SSH connections and events
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import type { Session, ConnectParams } from '../types';


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

  if (errorLower.includes('auth') || errorLower.includes('permission denied')) {
    return {
      title: 'Autenticación Fallida',
      message: 'Usuario, contraseña o clave SSH inválidos. Por favor verifica tus credenciales.',
    };
  }
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      title: 'Tiempo de Conexión Agotado',
      message: 'El servidor tardó demasiado en responder. Verifica si el host es accesible.',
    };
  }
  if (errorLower.includes('refused') || errorLower.includes('connection refused')) {
    return {
      title: 'Conexión Rechazada',
      message: 'El servidor rechazó la conexión. Verifica el puerto y la configuración del firewall.',
    };
  }
  if (errorLower.includes('unreachable') || errorLower.includes('no route')) {
    return {
      title: 'Host Inalcanzable',
      message: 'No se puede alcanzar el servidor. Verifica la conectividad de red.',
    };
  }
  if (errorLower.includes('key') && errorLower.includes('not found')) {
    return {
      title: 'Clave SSH No Encontrada',
      message: 'El archivo de clave privada especificado no existe.',
    };
  }
  if (errorLower.includes('dns') || errorLower.includes('resolve')) {
    return {
      title: 'Resolución DNS Fallida',
      message: 'No se pudo resolver el nombre del host. Verifica la dirección del servidor.',
    };
  }

  return {
    title: 'Conexión Fallida',
    message: error,
  };
}

class SSHService {
  private static instance: SSHService;
  private callbacks = new Map<string, (data: string) => void>();
  private channelListeners = new Map<string, () => void>(); // Per-channel event listeners
  private reconnectConfigs = new Map<string, ReconnectConfig>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private intentionalDisconnects = new Set<string>(); // Track intentional disconnections by channelId
  private initialized = false;
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

    // Listen for PTY closed events - trigger auto-reconnect if configured
    this.closedUnlisten = await listen<string>('pty_closed', (event) => {
      const channelId = event.payload;
      console.log('SSHService: Received pty_closed event for channel', channelId);

      const { tabs, updateTabStatus, addToast, clearTabChannel } = useStore.getState();
      const tab = tabs.find(t => t.channelId === channelId);

      // Check if this was an intentional disconnect
      const wasIntentional = this.intentionalDisconnects.has(channelId);
      if (wasIntentional) {
        console.log('SSHService: Intentional disconnect detected, cleaning up without auto-reconnect');
        this.intentionalDisconnects.delete(channelId);
      }

      if (tab) {
        // ALWAYS clear the channelId and update status when pty closes
        clearTabChannel(tab.id);
        updateTabStatus(tab.id, 'disconnected');

        // Only try auto-reconnect if NOT intentional
        if (!wasIntentional) {
          const config = this.reconnectConfigs.get(tab.id);
          if (config) {
            addToast({
              type: 'warning',
              title: 'Conexión perdida',
              message: 'Intentando reconectar...',
              duration: 3000,
            });
            this.scheduleReconnect(tab.id, 1);
          } else {
            // Show disconnected message only if not auto-reconnecting
            addToast({
              type: 'info',
              title: 'Desconectado',
              message: `Sesión ${tab.title} cerrada`,
              duration: 3000,
            });
          }
        }
      }
      // Clean up channel listener
      this.stopReading(channelId);
    });
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

  // Mark that the user intentionally exited (via exit, logout, close button, etc.)
  // This prevents auto-reconnect from triggering
  markIntentionalExit(tabId: string, channelId?: string) {
    console.log(`SSHService: Marking intentional exit for tab ${tabId}, channel ${channelId}`);
    this.disableAutoReconnect(tabId);
    if (channelId) {
      this.intentionalDisconnects.add(channelId);
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
          title: 'Reconectado',
          message: `Reconectado exitosamente a ${config.session.name}`,
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

    const params: ConnectParams = {
      host: session.host,
      port: session.port,
      username: session.username,
      authMethod: session.authMethod || 'password',
      password: session.password,
      privateKeyPath: session.privateKeyPath,
      privateKeyPassphrase: session.privateKeyPassphrase,
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
        title: 'Conectado',
        message: `Conectado a ${session.name}`,
      });
      return channelId;
    } catch (error) {
      console.error('SSH connection failed:', error);
      updateTabStatus(tabId, 'error');

      const errorInfo = classifyError(String(error));
      addToast({
        type: 'error',
        title: errorInfo.title,
        message: errorInfo.message,
        duration: 5000,
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
        title: 'Send Failed',
        message: 'Could not send data to server',
        duration: 2500,
      });
    }
  }

  async startReading(channelId: string, onData: (data: string) => void) {
    // Store callback
    this.callbacks.set(channelId, onData);

    // Clean up any existing listener for this channel
    const existingListener = this.channelListeners.get(channelId);
    if (existingListener) {
      existingListener();
    }

    // Listen for this specific channel's output events
    // Backend emits: app.emit(&format!("ssh-output-{}", channel_id), output)
    const eventName = `ssh-output-${channelId}`;
    console.log(`SSHService: Subscribing to ${eventName}`);

    const unlisten = await listen<string>(eventName, (event) => {
      const callback = this.callbacks.get(channelId);
      if (callback) {
        callback(event.payload);
      }
    });

    this.channelListeners.set(channelId, unlisten);
  }

  stopReading(channelId: string) {
    // Remove callback
    this.callbacks.delete(channelId);

    // Unsubscribe from channel events
    const unlisten = this.channelListeners.get(channelId);
    if (unlisten) {
      unlisten();
      this.channelListeners.delete(channelId);
    }
  }

  async resize(channelId: string, cols: number, rows: number) {
    try {
      await invoke('ssh_resize', { channelId, cols, rows });
    } catch (error) {
      console.error('Failed to resize:', error);
    }
  }

  async disconnect(tabId: string, channelId: string) {
    const { updateTabStatus, clearTabChannel } = useStore.getState();

    console.log(`SSHService: Disconnecting tab ${tabId}, channel ${channelId}`);

    // FIRST: Mark as intentional to prevent race conditions with pty_closed event
    this.intentionalDisconnects.add(channelId);
    this.disableAutoReconnect(tabId);

    // THEN: Clean up listeners and callbacks
    this.stopReading(channelId);

    // Update UI state immediately (don't wait for backend)
    clearTabChannel(tabId);
    updateTabStatus(tabId, 'disconnected');

    // FINALLY: Call backend to close the connection
    try {
      await invoke('ssh_disconnect', { channelId });
      console.log(`SSHService: Successfully disconnected channel ${channelId}`);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  cleanup() {
    this.closedUnlisten?.();
    // Clean up all channel listeners
    this.channelListeners.forEach(unlisten => unlisten());
    this.channelListeners.clear();
    this.callbacks.clear();
    this.reconnectConfigs.clear();
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.intentionalDisconnects.clear();
    this.initialized = false;
  }
}

// Export singleton instance
export const sshService = SSHService.getInstance();
