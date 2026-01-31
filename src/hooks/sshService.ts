// Singleton SSH Service - handles all SSH connections and events
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store/useStore';
import type { Session, ConnectParams } from '../types';

interface PtyOutputPayload {
  channelId: string;
  data: string;
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
  private reconnectConfigs = new Map<string, ReconnectConfig>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
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

    // Listen for PTY output
    this.outputUnlisten = await listen<PtyOutputPayload>('pty_output', (event) => {
      const { channelId, data } = event.payload;
      const callback = this.callbacks.get(channelId);
      if (callback) {
        callback(data);
      }
    });

    // Listen for PTY closed events - trigger auto-reconnect if configured
    this.closedUnlisten = await listen<string>('pty_closed', (event) => {
      const channelId = event.payload;
      const { tabs, updateTabStatus, addToast } = useStore.getState();
      const tab = tabs.find(t => t.channelId === channelId);

      if (tab) {
        updateTabStatus(tab.id, 'disconnected');

        // Check if auto-reconnect is configured for this tab
        const config = this.reconnectConfigs.get(tab.id);
        if (config) {
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
      updateTabStatus(tabId, 'disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  cleanup() {
    this.outputUnlisten?.();
    this.closedUnlisten?.();
    this.callbacks.clear();
    this.reconnectConfigs.clear();
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
    this.initialized = false;
  }
}

// Export singleton instance
export const sshService = SSHService.getInstance();
