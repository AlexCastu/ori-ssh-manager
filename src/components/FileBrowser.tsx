import { useEffect, useState, useCallback } from 'react';
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
  Upload,
  Download,
  Trash2,
  Edit3,
  X,
  Loader2,
  AlertCircle,
  Link,
} from 'lucide-react';
import { useSftp, type FileEntry } from '../hooks/useSftp';
import { useStore } from '../store/useStore';

interface FileBrowserProps {
  channelId: string | null;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

// Get icon based on file type
function getFileIcon(entry: FileEntry) {
  if (entry.is_dir) {
    return <FolderOpen className="w-4 h-4 text-yellow-400" />;
  }
  if (entry.is_symlink) {
    return <Link className="w-4 h-4 text-cyan-400" />;
  }

  const ext = entry.name.split('.').pop()?.toLowerCase() || '';

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return <FileImage className="w-4 h-4 text-purple-400" />;
  }

  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash', 'zsh'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-green-400" />;
  }

  // Config files
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'config', 'env'].includes(ext)) {
    return <Settings className="w-4 h-4 text-orange-400" />;
  }

  // Text files
  if (['txt', 'md', 'log', 'readme'].includes(ext)) {
    return <FileText className="w-4 h-4 text-blue-400" />;
  }

  return <File className="w-4 h-4 text-zinc-400" />;
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
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
void _formatDate; // Silence unused warning

export function FileBrowser({ channelId, onClose, onNavigate }: FileBrowserProps) {
  const { addToast } = useStore();
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);
  const [showHidden, setShowHidden] = useState(false);

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
    deleteEntry,
    rename,
    canGoBack,
    canGoUp,
  } = useSftp({
    channelId,
    onError: (msg) => {
      addToast({
        type: 'error',
        title: 'SFTP Error',
        message: msg,
        duration: 4000,
      });
    },
  });

  // Load initial directory
  useEffect(() => {
    if (channelId) {
      listDir('~');
    }
  }, [channelId, listDir]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleEntryClick = useCallback((entry: FileEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
      onNavigate?.(entry.path);
    }
  }, [navigateTo, onNavigate]);

  const handleEntryDoubleClick = useCallback(async (entry: FileEntry) => {
    if (!entry.is_dir) {
      const bytes = await download(entry.path, entry.name);
      if (bytes !== undefined) {
        addToast({
          type: 'success',
          title: 'Download complete',
          message: `${entry.name} (${formatSize(bytes)})`,
          duration: 3000,
        });
      }
    }
  }, [download, addToast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setContextMenu({ entry, x: e.clientX, y: e.clientY });
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await mkdir(newFolderName.trim());
    setNewFolderName('');
    setShowNewFolderInput(false);
    addToast({
      type: 'success',
      title: 'Folder created',
      message: newFolderName,
      duration: 2000,
    });
  };

  const handleRename = async () => {
    if (!renameEntry || !renameName.trim()) return;
    await rename(renameEntry.path, renameName.trim());
    setRenameEntry(null);
    setRenameName('');
    addToast({
      type: 'success',
      title: 'Renamed',
      message: renameName,
      duration: 2000,
    });
  };

  const handleDelete = async (entry: FileEntry) => {
    const confirmed = confirm(`Delete ${entry.is_dir ? 'folder' : 'file'} "${entry.name}"?`);
    if (!confirmed) return;
    await deleteEntry(entry.path, entry.is_dir);
    addToast({
      type: 'success',
      title: 'Deleted',
      message: entry.name,
      duration: 2000,
    });
  };

  const handleUpload = async () => {
    const bytes = await upload();
    if (bytes !== undefined) {
      addToast({
        type: 'success',
        title: 'Upload complete',
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
    <div className="w-80 bg-zinc-900/95 backdrop-blur-xl border-l border-white/5 flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-zinc-200">File Browser</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Path display */}
        <div className="text-xs text-zinc-500 font-mono truncate mb-2" title={currentPath}>
          {currentPath}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button
            onClick={navigateBack}
            disabled={!canGoBack || loading}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={navigateUp}
            disabled={!canGoUp || loading}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowNewFolderInput(true)}
            disabled={loading}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-yellow-400 disabled:opacity-30 transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={handleUpload}
            disabled={loading}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-green-400 disabled:opacity-30 transition-colors"
            title="Upload"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showHidden ? 'text-blue-400' : 'text-zinc-400 hover:text-white'}`}
            title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          >
            <span className="text-xs font-mono">.*</span>
          </button>
        </div>
      </div>

      {/* New Folder Input */}
      <AnimatePresence>
        {showNewFolderInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 py-2 border-b border-white/5 bg-zinc-800/50"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') setShowNewFolderInput(false);
                }}
                placeholder="New folder name..."
                className="flex-1 px-2 py-1 text-sm bg-zinc-900 border border-white/10 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewFolderInput(false)}
                className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error State */}
      {error && (
        <div className="px-3 py-2 bg-red-900/20 border-b border-red-500/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-400 truncate">{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && entries.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredEntries.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">Empty folder</span>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredEntries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => handleEntryClick(entry)}
                onDoubleClick={() => handleEntryDoubleClick(entry)}
                onContextMenu={(e) => handleContextMenu(e, entry)}
                className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                  entry.is_dir ? 'hover:bg-yellow-500/10' : 'hover:bg-blue-500/10'
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
                      className="flex-1 px-1 py-0.5 text-sm bg-zinc-800 border border-blue-500 rounded text-white focus:outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ) : (
                  <>
                    {getFileIcon(entry)}
                    <span
                      className={`flex-1 text-sm truncate ${
                        entry.is_dir ? 'text-zinc-200' : 'text-zinc-400'
                      }`}
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {entry.is_dir ? '' : formatSize(entry.size)}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                      {!entry.is_dir && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEntryDoubleClick(entry);
                          }}
                          className="p-1 rounded hover:bg-green-500/20 text-zinc-500 hover:text-green-400"
                          title="Download"
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
                        className="p-1 rounded hover:bg-blue-500/20 text-zinc-500 hover:text-blue-400"
                        title="Rename"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry);
                        }}
                        className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                        title="Delete"
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
            className="fixed z-50 bg-zinc-800 border border-white/10 rounded-lg shadow-xl py-1 min-w-32"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {!contextMenu.entry.is_dir && (
              <button
                onClick={() => {
                  handleEntryDoubleClick(contextMenu.entry);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            <button
              onClick={() => {
                setRenameEntry(contextMenu.entry);
                setRenameName(contextMenu.entry.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
            >
              <Edit3 className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={() => {
                handleDelete(contextMenu.entry);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-white/5 text-xs text-zinc-500 flex items-center justify-between shrink-0">
        <span>{filteredEntries.length} items</span>
        <span className="font-mono text-[10px]">
          {filteredEntries.filter((e) => e.is_dir).length} folders,{' '}
          {filteredEntries.filter((e) => !e.is_dir).length} files
        </span>
      </div>
    </div>
  );
}
