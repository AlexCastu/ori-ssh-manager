import { useCallback, useEffect } from 'react';
import { sshService } from './sshService';
import type { Session } from '../types';

export function useSSHConnection() {
  // Initialize SSH service once
  useEffect(() => {
    sshService.initialize();
  }, []);

  const connect = useCallback(
    async (tabId: string, session: Session, cols?: number, rows?: number): Promise<string | null> => {
      return sshService.connect(tabId, session, cols, rows);
    },
    []
  );

  const send = useCallback(async (channelId: string, data: string) => {
    await sshService.send(channelId, data);
  }, []);

  const startReading = useCallback(
    (channelId: string, onData: (data: string) => void) => {
      sshService.startReading(channelId, onData);
    },
    []
  );

  const stopReading = useCallback((channelId: string) => {
    sshService.stopReading(channelId);
  }, []);

  const resize = useCallback(async (channelId: string, cols: number, rows: number) => {
    await sshService.resize(channelId, cols, rows);
  }, []);

  const disconnect = useCallback(async (tabId: string, channelId: string) => {
    await sshService.disconnect(tabId, channelId);
  }, []);

  return {
    connect,
    send,
    startReading,
    stopReading,
    resize,
    disconnect,
  };
}
