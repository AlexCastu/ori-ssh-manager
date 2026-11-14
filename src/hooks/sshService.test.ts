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
    vi.restoreAllMocks();
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

  it.each([
    [
      'Permission denied',
      'Autenticación fallida',
      'Usuario, contraseña o clave SSH incorrectos. Revisa tus credenciales.',
    ],
    [
      'Connection timed out',
      'Tiempo de conexión agotado',
      'El servidor tardó demasiado en responder. Comprueba que esté accesible.',
    ],
    [
      'Connection refused',
      'Conexión rechazada',
      'El servidor rechazó la conexión. Revisa el puerto y el cortafuegos.',
    ],
    [
      'No route to host',
      'Servidor inaccesible',
      'No se puede acceder al servidor. Comprueba la conexión de red.',
    ],
    [
      'Key file not found',
      'Clave SSH no encontrada',
      'El archivo de clave privada indicado no existe.',
    ],
    [
      'DNS resolve failed',
      'Error de resolución DNS',
      'No se pudo resolver el nombre del servidor. Revisa su dirección.',
    ],
  ])('shows a Spanish toast for %s', async (error, title, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(error);
    const tabId = useStore.getState().createTab(session.id);

    await sshService.connect(tabId, session);

    expect(useStore.getState().toasts).toEqual([
      expect.objectContaining({ type: 'error', title, message, duration: 5000 }),
    ]);
  });

  it('keeps the host-key action and extended duration with the Spanish title', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = 'Host key for jump.example.test:2222 CHANGED';
    vi.mocked(invoke).mockRejectedValueOnce(error);
    const tabId = useStore.getState().createTab(session.id);

    await sshService.connect(tabId, session);

    const [toast] = useStore.getState().toasts;
    expect(toast).toMatchObject({
      title: 'No se pudo verificar la clave del servidor',
      message: error,
      duration: 12000,
      action: { label: 'Olvidar clave de jump.example.test' },
    });
    toast.action?.onClick();
    expect(invoke).toHaveBeenCalledWith('forget_host_key', {
      host: 'jump.example.test',
      port: 2222,
    });
  });
});
