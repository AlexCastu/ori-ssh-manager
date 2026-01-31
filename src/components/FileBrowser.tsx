import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileImage,
  Settings,
  ChevronLeft,
  ChevronUp,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Upload,
  Download,
  Trash2,
  Edit3,
  X,
  Check,
  Loader2,
  AlertCircle,
  Link,
} from 'lucide-react';
import { useSftp, type FileEntry } from '../hooks/useSftp';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';

interface FileBrowserProps {
  channelId: string | null;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onCommand?: (command: string) => void;
}

// Get icon based on file type
function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) {
    return <FolderOpen className="w-4 h-4 text-[var(--file-folder)]" />;
  }
  if (entry.is_symlink) {
    return <Link className="w-4 h-4 text-[var(--file-symlink)]" />;
  }

  const ext = entry.name.split('.').pop()?.toLowerCase() || '';

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return <FileImage className="w-4 h-4 text-[var(--file-image)]" />;
  }

  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash', 'zsh'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-[var(--file-code)]" />;
  }

  // Config files
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'config', 'env'].includes(ext)) {
    return <Settings className="w-4 h-4 text-[var(--file-config)]" />;
  }

  // Text files
  if (['txt', 'md', 'log', 'readme'].includes(ext)) {
    return <FileText className="w-4 h-4 text-[var(--file-text)]" />;
  }

  return <File className="w-4 h-4 text-[var(--file-default)]" />;
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// Format date (used for potential future features like tooltips)
function _formatDate(timestamp: number | null): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('es-ES', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
void _formatDate; // Silence unused warning

export function FileBrowser({ channelId, onClose, onNavigate, onCommand }: FileBrowserProps) {
  const { addToast } = useStore();
  const { isDark } = useTheme();
  const [showNewInput, setShowNewInput] = useState<'folder' | 'file' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // Click handling refs for distinguishing single vs double click
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickedPathRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  const {
    currentPath,
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
    canGoBack,
    canGoUp,
    isOperating,
  } = useSftp({
    channelId,
    onError: (msg) => {
      addToast({
        type: 'error',
        title: 'Error SFTP',
        message: msg,
        duration: 4000,
      });
    },
    onCommand,
  });

  // Load initial directory only once
  useEffect(() => {
    if (channelId && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      listDir('~');
    }
  }, [channelId]); // Removed listDir from deps to prevent re-runs

  // Reset initial load flag when channelId changes
  useEffect(() => {
    if (!channelId) {
      initialLoadDoneRef.current = false;
    }
  }, [channelId]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  // Wrapper para navigateUp que sincroniza con la terminal
  const handleNavigateUp = useCallback(async () => {
    const newPath = await navigateUp();
    if (newPath) {
      onNavigate?.(newPath);
    }
  }, [navigateUp, onNavigate]);

  // Wrapper para navigateBack que sincroniza con la terminal
  const handleNavigateBack = useCallback(async () => {
    const newPath = await navigateBack();
    if (newPath) {
      onNavigate?.(newPath);
    }
  }, [navigateBack, onNavigate]);

  // Handle click with debounce to distinguish single/double click
  const handleEntryClick = useCallback((entry: FileEntry) => {
    // Block if already operating
    if (isOperating()) return;

    // If same entry clicked again quickly, treat as double-click
    if (lastClickedPathRef.current === entry.path && clickTimerRef.current) {
      // Clear timer and handle as double-click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickedPathRef.current = null;

      // Double-click: download file (not dir)
      if (!entry.is_dir) {
        download(entry.path, entry.name).then((bytes) => {
          if (bytes !== undefined) {
            addToast({
              type: 'success',
              title: 'Descarga completa',
              message: `${entry.name} (${formatSize(bytes)})`,
              duration: 3000,
            });
          }
        });
      }
      return;
    }

    // Clear any existing timer
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    lastClickedPathRef.current = entry.path;

    // Set timer for single-click action
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      lastClickedPathRef.current = null;

      // Single-click: navigate to directory
      if (entry.is_dir) {
        navigateTo(entry.path);
        onNavigate?.(entry.path);
      }
    }, 250); // 250ms delay to wait for potential second click
  }, [isOperating, navigateTo, onNavigate, download, addToast]);

  // Explicit double-click handler for files (backup)
  const handleEntryDoubleClick = useCallback(async (entry: FileEntry) => {
    // Block if already operating
    if (isOperating()) return;

    // Clear any pending single-click timer
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    lastClickedPathRef.current = null;

    if (!entry.is_dir) {
      const bytes = await download(entry.path, entry.name);
      if (bytes !== undefined) {
        addToast({
          type: 'success',
          title: 'Descarga completa',
          message: `${entry.name} (${formatSize(bytes)})`,
          duration: 3000,
        });
      }
    }
  }, [isOperating, download, addToast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setContextMenu({ entry, x: e.clientX, y: e.clientY });
  }, []);

  const handleCreateFolder = async () => {
    if (!newItemName.trim() || isOperating()) return;
    await mkdir(newItemName.trim());
    setNewItemName('');
    setShowNewInput(null);
    addToast({
      type: 'success',
      title: 'Carpeta creada',
      message: newItemName,
      duration: 2000,
    });
  };

  const handleCreateFile = async () => {
    if (!newItemName.trim() || isOperating()) return;
    await touch(newItemName.trim());
    setNewItemName('');
    setShowNewInput(null);
    addToast({
      type: 'success',
      title: 'Archivo creado',
      message: newItemName,
      duration: 2000,
    });
  };

  const handleRename = async () => {
    if (!renameEntry || !renameName.trim() || isOperating()) return;
    await rename(renameEntry.path, renameName.trim());
    setRenameEntry(null);
    setRenameName('');
    addToast({
      type: 'success',
      title: 'Renombrado',
      message: renameName,
      duration: 2000,
    });
  };

  const handleDelete = async (entry: FileEntry) => {
    if (isOperating()) return;
    const confirmed = confirm(`¿Eliminar ${entry.is_dir ? 'carpeta' : 'archivo'} "${entry.name}"?`);
    if (!confirmed) return;
    await deleteEntry(entry.path, entry.is_dir);
    addToast({
      type: 'success',
      title: 'Eliminado',
      message: entry.name,
      duration: 2000,
    });
  };

  const handleUpload = async () => {
    if (isOperating()) return;
    const bytes = await upload();
    if (bytes !== undefined) {
      addToast({
        type: 'success',
        title: 'Subida completa',
        message: `${formatSize(bytes)}`,
        duration: 3000,
      });
    }
  };

  // Filter entries based on showHidden setting
  const filteredEntries = showHidden
    ? entries
    : entries.filter((e) => !e.name.startsWith('.'));

  return (
    <div className={`w-80 border-l flex flex-col h-full ${
      isDark
        ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
        : 'bg-[var(--bg-primary)] border-[var(--border-primary)]'
    }`}>
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-[var(--border-primary)] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">Explorador de Archivos</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Path display */}
        <div className="text-xs text-[var(--text-tertiary)] font-mono truncate mb-1" title={currentPath}>
          {currentPath}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleNavigateBack}
            disabled={!canGoBack || isOperating()}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Atrás"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNavigateUp}
            disabled={!canGoUp || isOperating()}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Subir"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={refresh}
            disabled={isOperating()}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowNewInput('file')}
            disabled={isOperating()}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--file-code)] disabled:opacity-30 transition-colors"
            title="Nuevo Archivo"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowNewInput('folder')}
            disabled={isOperating()}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--file-folder)] disabled:opacity-30 transition-colors"
            title="Nueva Carpeta"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={handleUpload}
            disabled={isOperating()}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--success)] disabled:opacity-30 transition-colors"
            title="Subir"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors ${showHidden ? 'text-[var(--accent-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            title={showHidden ? 'Ocultar archivos ocultos' : 'Mostrar archivos ocultos'}
          >
            <span className="text-xs font-mono">.*</span>
          </button>
        </div>
      </div>

      {/* New Item Input (Folder or File) */}
      <AnimatePresence>
        {showNewInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`px-3 py-2 border-b ${
              isDark
                ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]'
                : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {showNewInput === 'folder' ? (
                <FolderPlus className="w-4 h-4 text-[var(--file-folder)] shrink-0" />
              ) : (
                <FilePlus className="w-4 h-4 text-[var(--file-code)] shrink-0" />
              )}
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    showNewInput === 'folder' ? handleCreateFolder() : handleCreateFile();
                  }
                  if (e.key === 'Escape') {
                    setShowNewInput(null);
                    setNewItemName('');
                  }
                }}
                placeholder={showNewInput === 'folder' ? 'Nombre de la carpeta...' : 'Nombre del archivo...'}
                className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:border-[var(--accent-primary)] ${
                  isDark
                    ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                    : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                }`}
                autoFocus
              />
              <button
                onClick={() => showNewInput === 'folder' ? handleCreateFolder() : handleCreateFile()}
                disabled={!newItemName.trim()}
                className="p-1.5 rounded bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white disabled:opacity-30 transition-colors"
                title="Crear"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setShowNewInput(null);
                  setNewItemName('');
                }}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                title="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error State */}
      {error && (
        <div className="px-3 py-2 bg-[var(--error)]/10 border-b border-[var(--error)]/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[var(--error)] shrink-0" />
          <span className="text-xs text-[var(--error)] truncate">{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && entries.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[var(--accent-primary)] animate-spin" />
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredEntries.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)]">
            <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">Carpeta vacía</span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-primary)]">
            {filteredEntries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => handleEntryClick(entry)}
                onDoubleClick={() => handleEntryDoubleClick(entry)}
                onContextMenu={(e) => handleContextMenu(e, entry)}
                className={`group flex items-center gap-2 px-2 py-1 transition-colors ${
                  isOperating()
                    ? 'cursor-wait opacity-60'
                    : `cursor-pointer ${entry.is_dir ? 'hover:bg-[var(--file-folder)]/10' : 'hover:bg-[var(--accent-primary)]/10'}`
                }`}
              >
                {renameEntry?.path === entry.path ? (
                  <div className="flex-1 flex items-center gap-2">
                    {getFileIcon(entry)}
                    <input
                      type="text"
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') setRenameEntry(null);
                      }}
                      className={`flex-1 px-1 py-0.5 text-sm border rounded focus:outline-none ${
                        isDark
                          ? 'bg-[var(--bg-tertiary)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                          : 'bg-[var(--bg-primary)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                      }`}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ) : (
                  <>
                    {getFileIcon(entry)}
                    <span
                      className={`flex-1 text-sm truncate ${
                        entry.is_dir ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                      }`}
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                      {entry.is_dir ? '' : formatSize(entry.size)}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                      {!entry.is_dir && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEntryDoubleClick(entry);
                          }}
                          className="p-1 rounded hover:bg-[var(--success)]/20 text-[var(--text-tertiary)] hover:text-[var(--success)]"
                          title="Descargar"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameEntry(entry);
                          setRenameName(entry.name);
                        }}
                        className="p-1 rounded hover:bg-[var(--accent-primary)]/20 text-[var(--text-tertiary)] hover:text-[var(--accent-primary)]"
                        title="Renombrar"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry);
                        }}
                        className="p-1 rounded hover:bg-[var(--error)]/20 text-[var(--text-tertiary)] hover:text-[var(--error)]"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed z-50 border rounded-lg shadow-xl py-1 min-w-32 ${
              isDark
                ? 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
                : 'bg-[var(--bg-primary)] border-[var(--border-primary)]'
            }`}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {!contextMenu.entry.is_dir && (
              <button
                onClick={() => {
                  handleEntryDoubleClick(contextMenu.entry);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <Download className="w-4 h-4" />
                Descargar
              </button>
            )}
            <button
              onClick={() => {
                setRenameEntry(contextMenu.entry);
                setRenameName(contextMenu.entry.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <Edit3 className="w-4 h-4" />
              Renombrar
            </button>
            <button
              onClick={() => {
                handleDelete(contextMenu.entry);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--error)] hover:bg-[var(--error)]/10"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Bar */}
      <div className="px-2 py-1 border-t border-[var(--border-primary)] text-xs text-[var(--text-tertiary)] flex items-center justify-between shrink-0">
        <span>{filteredEntries.length} elementos</span>
        <span className="font-mono text-[10px]">
          {filteredEntries.filter((e) => e.is_dir).length} carpetas,{' '}
          {filteredEntries.filter((e) => !e.is_dir).length} archivos
        </span>
      </div>
    </div>
  );
}
