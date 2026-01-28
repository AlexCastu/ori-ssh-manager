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
}

export function useSftp({ channelId, initialPath = '~', onError }: UseSftpOptions) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    onError?.(msg);
  }, [onError]);

  const listDir = useCallback(async (path: string) => {
    if (!channelId) {
      handleError('No active SSH channel');
      return;
    }

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
      handleError(`Failed to list directory: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError]);

  const navigateTo = useCallback(async (path: string) => {
    historyRef.current.push(currentPath);
    await listDir(path);
  }, [currentPath, listDir]);

  const navigateUp = useCallback(async () => {
    if (parentPath) {
      historyRef.current.push(currentPath);
      await listDir(parentPath);
    }
  }, [parentPath, currentPath, listDir]);

  const navigateBack = useCallback(async () => {
    const previousPath = historyRef.current.pop();
    if (previousPath) {
      await listDir(previousPath);
    }
  }, [listDir]);

  const refresh = useCallback(() => {
    return listDir(currentPath);
  }, [currentPath, listDir]);

  const download = useCallback(async (remotePath: string, fileName: string) => {
    if (!channelId) {
      handleError('No active SSH channel');
      return;
    }

    try {
      // Open save dialog
      const localPath = await save({
        defaultPath: fileName,
        title: 'Save file as...',
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
      handleError(`Download failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError]);

  const upload = useCallback(async (targetDir?: string) => {
    if (!channelId) {
      handleError('No active SSH channel');
      return;
    }

    try {
      // Open file picker dialog
      const localPath = await open({
        multiple: false,
        title: 'Select file to upload',
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
      handleError(`Upload failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, currentPath, handleError, refresh]);

  const mkdir = useCallback(async (name: string) => {
    if (!channelId) {
      handleError('No active SSH channel');
      return;
    }

    const path = `${currentPath.replace(/\/$/, '')}/${name}`;

    try {
      setLoading(true);
      await invoke('sftp_mkdir', { channelId, path });
      await refresh();
    } catch (e) {
      handleError(`Failed to create directory: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, currentPath, handleError, refresh]);

  const deleteEntry = useCallback(async (path: string, isDir: boolean) => {
    if (!channelId) {
      handleError('No active SSH channel');
      return;
    }

    try {
      setLoading(true);
      await invoke('sftp_delete', { channelId, path, isDir });
      await refresh();
    } catch (e) {
      handleError(`Failed to delete: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError, refresh]);

  const rename = useCallback(async (oldPath: string, newName: string) => {
    if (!channelId) {
      handleError('No active SSH channel');
      return;
    }

    // Extract directory from old path
    const lastSlash = oldPath.lastIndexOf('/');
    const dir = lastSlash > 0 ? oldPath.substring(0, lastSlash) : '';
    const newPath = `${dir}/${newName}`;

    try {
      setLoading(true);
      await invoke('sftp_rename', { channelId, oldPath, newPath });
      await refresh();
    } catch (e) {
      handleError(`Failed to rename: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [channelId, handleError, refresh]);

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
    deleteEntry,
    rename,
    canGoBack: historyRef.current.length > 0,
    canGoUp: parentPath !== null,
  };
}
