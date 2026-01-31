import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  permissions: string;
  modified: number | null;
}

export interface ListDirResult {
  current_path: string;
  parent_path: string | null;
  entries: FileEntry[];
}

interface UseSftpOptions {
  channelId: string | null;
  initialPath?: string;
  onError?: (error: string) => void;
  onCommand?: (command: string) => void; // Callback to log commands to terminal
}

export function useSftp({ channelId, initialPath = '~', onError, onCommand }: UseSftpOptions) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);

  // Flag to prevent concurrent operations
  const isOperatingRef = useRef(false);
  // Last operation timestamp for debouncing
  const lastOpTimeRef = useRef(0);
  const MIN_OP_INTERVAL = 300; // Minimum ms between operations

  const handleError = useCallback((msg: string) => {
    setError(msg);
    onError?.(msg);
  }, [onError]);

  const listDir = useCallback(async (path: string, skipDebounce = false) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    // Prevent concurrent operations
    if (isOperatingRef.current) {
      return;
    }

    // Debounce rapid calls
    const now = Date.now();
    if (!skipDebounce && now - lastOpTimeRef.current < MIN_OP_INTERVAL) {
      return;
    }
    lastOpTimeRef.current = now;

    isOperatingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await invoke<ListDirResult>('sftp_list_dir', {
        channelId,
        path,
      });

      setCurrentPath(result.current_path);
      setParentPath(result.parent_path);
      setEntries(result.entries);
    } catch (e) {
      handleError(`Error al listar directorio: ${e}`);
    } finally {
      setLoading(false);
      isOperatingRef.current = false;
    }
  }, [channelId, handleError]);

  const navigateTo = useCallback(async (path: string): Promise<string | null> => {
    // Prevent if already operating
    if (isOperatingRef.current) return null;
    historyRef.current.push(currentPath);
    await listDir(path);
    return path;
  }, [currentPath, listDir]);

  const navigateUp = useCallback(async (): Promise<string | null> => {
    if (isOperatingRef.current) return null;
    if (parentPath) {
      historyRef.current.push(currentPath);
      await listDir(parentPath);
      return parentPath;
    }
    return null;
  }, [parentPath, currentPath, listDir]);

  const navigateBack = useCallback(async (): Promise<string | null> => {
    if (isOperatingRef.current) return null;
    const previousPath = historyRef.current.pop();
    if (previousPath) {
      await listDir(previousPath);
      return previousPath;
    }
    return null;
  }, [listDir]);

  const refresh = useCallback(() => {
    if (isOperatingRef.current) return Promise.resolve();
    return listDir(currentPath, true); // Skip debounce for manual refresh
  }, [currentPath, listDir]);

  // Check if currently operating (for UI to block interactions)
  const isOperating = useCallback(() => isOperatingRef.current || loading, [loading]);

  const download = useCallback(async (remotePath: string, fileName: string) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    try {
      // Open save dialog
      const localPath = await save({
        defaultPath: fileName,
        title: 'Guardar archivo como...',
      });

      if (!localPath) return; // User cancelled

      setLoading(true);
      const bytes = await invoke<number>('sftp_download', {
        channelId,
        remotePath,
        localPath,
      });

      return bytes;
    } catch (e) {
      handleError(`Descarga fallida: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError]);

  const upload = useCallback(async (targetDir?: string) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    try {
      // Open file picker dialog
      const localPath = await open({
        multiple: false,
        title: 'Seleccionar archivo para subir',
      });

      if (!localPath) return; // User cancelled

      const fileName = localPath.split('/').pop() || localPath.split('\\').pop() || 'uploaded_file';
      const dir = targetDir || currentPath;
      const remotePath = `${dir.replace(/\/$/, '')}/${fileName}`;

      setLoading(true);
      const bytes = await invoke<number>('sftp_upload', {
        channelId,
        localPath,
        remotePath,
      });

      // Refresh after upload
      await refresh();
      return bytes;
    } catch (e) {
      handleError(`Subida fallida: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, currentPath, handleError, refresh]);

  const mkdir = useCallback(async (name: string) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    const path = `${currentPath.replace(/\/$/, '')}/${name}`;

    try {
      setLoading(true);
      await invoke('sftp_mkdir', { channelId, path });
      onCommand?.(`mkdir "${path}"`);
      await refresh();
    } catch (e) {
      handleError(`Error al crear directorio: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, currentPath, handleError, refresh, onCommand]);

  const deleteEntry = useCallback(async (path: string, isDir: boolean) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    try {
      setLoading(true);
      await invoke('sftp_delete', { channelId, path, isDir });
      onCommand?.(isDir ? `rm -rf "${path}"` : `rm "${path}"`);
      await refresh();
    } catch (e) {
      handleError(`Error al eliminar: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError, refresh, onCommand]);

  const rename = useCallback(async (oldPath: string, newName: string) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    // Extract directory from old path
    const lastSlash = oldPath.lastIndexOf('/');
    const dir = lastSlash > 0 ? oldPath.substring(0, lastSlash) : '';
    const newPath = `${dir}/${newName}`;

    try {
      setLoading(true);
      await invoke('sftp_rename', { channelId, oldPath, newPath });
      onCommand?.(`mv "${oldPath}" "${newPath}"`);
      await refresh();
    } catch (e) {
      handleError(`Error al renombrar: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError, refresh, onCommand]);

  const touch = useCallback(async (name: string) => {
    if (!channelId) {
      handleError('No hay canal SSH activo');
      return;
    }

    const path = `${currentPath.replace(/\/$/, '')}/${name}`;

    try {
      setLoading(true);
      await invoke('sftp_touch', { channelId, path });
      onCommand?.(`touch "${path}"`);
      await refresh();
    } catch (e) {
      handleError(`Error al crear archivo: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, currentPath, handleError, refresh, onCommand]);

  return {
    currentPath,
    parentPath,
    entries,
    loading,
    error,
    listDir,
    navigateTo,
    navigateUp,
    navigateBack,
    refresh,
    download,
    upload,
    mkdir,
    touch,
    deleteEntry,
    rename,
    canGoBack: historyRef.current.length > 0,
    canGoUp: parentPath !== null,
    isOperating,
  };
}
