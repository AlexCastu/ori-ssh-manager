import {
  Command,
  Plus,
  Play,
  Trash2,
  Edit2,
  ChevronLeft,
  Code,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { sshService } from '../hooks/sshService';
import { NoteBadge } from './NoteBadge';
import { ConfirmDialog } from './ConfirmDialog';
import type { SavedCommand } from '../types';

export function CommandPanel() {
  const {
    commands,
    tabs,
    activeTabId,
    deleteCommand,
    openCommandModal,
    commandPanelCollapsed,
    toggleCommandPanel,
    terminalZoom,
    setTerminalZoom,
  } = useStore(
    useShallow((s) => ({
      commands: s.commands,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      deleteCommand: s.deleteCommand,
      openCommandModal: s.openCommandModal,
      commandPanelCollapsed: s.commandPanelCollapsed,
      toggleCommandPanel: s.toggleCommandPanel,
      terminalZoom: s.terminalZoom,
      setTerminalZoom: s.setTerminalZoom,
    }))
  );

  const [deleteTarget, setDeleteTarget] = useState<SavedCommand | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const canSendCommand = activeTab?.status === 'connected' && activeTab.channelId;

  // Global commands always; session-scoped only for the active tab's session
  const visibleCommands = commands.filter(
    (c) => !c.sessionId || c.sessionId === activeTab?.sessionId
  );

  const executeCommand = async (command: string) => {
    if (!canSendCommand || !activeTab?.channelId) return;
    await sshService.send(activeTab.channelId, command + '\n');
  };

  const handleEdit = (command: SavedCommand) => {
    openCommandModal({ command, mode: 'edit' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCommand(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Collapsed state - just show expand button
  if (commandPanelCollapsed) {
    return (
      <div className="w-10 shrink-0 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border-l border-zinc-200 dark:border-white/5 flex flex-col items-center py-2 gap-2">
        <button
          onClick={toggleCommandPanel}
          className="p-2 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          title="Mostrar comandos"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Zoom controls in collapsed mode */}
        <div className="flex flex-col gap-1 mt-2">
          <button
            onClick={() => setTerminalZoom(terminalZoom + 0.1)}
            className="p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTerminalZoom(1.0)}
            className="p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            title="Restablecer zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTerminalZoom(terminalZoom - 0.1)}
            className="p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            title="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="w-72 shrink-0 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border-l border-zinc-200 dark:border-white/5 flex flex-col">
      {/* Header with collapse button */}
      <div className="p-3 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Command className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Comandos</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={() => setTerminalZoom(terminalZoom - 0.1)}
            disabled={terminalZoom <= 0.7}
            className="p-1 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            title="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-zinc-500 w-9 text-center tabular-nums">
            {Math.round(terminalZoom * 100)}%
          </span>
          <button
            onClick={() => setTerminalZoom(terminalZoom + 0.1)}
            disabled={terminalZoom >= 1.5}
            className="p-1 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleCommandPanel}
            className="p-1 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors ml-1"
            title="Ocultar comandos"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>

      {/* Content: only user-saved commands (no preset/default commands, which
          assume a Linux shell and break on Windows and other environments) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {visibleCommands.map((cmd) => (
          <div
            key={cmd.id}
            className="group p-2 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                  {cmd.name}
                </span>
                {cmd.notes ? <NoteBadge notes={cmd.notes} /> : null}
                {cmd.sessionId && (
                  <span
                    className="shrink-0 px-1.5 py-px rounded text-[10px] font-semibold uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400"
                    title="Solo visible en su sesión"
                  >
                    Sesión
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => executeCommand(cmd.command)}
                  disabled={!canSendCommand}
                  className="p-1 rounded hover:bg-green-500/20 text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Ejecutar"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleEdit(cmd)}
                  className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(cmd)}
                  className="p-1 rounded hover:bg-red-500/20 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <code className="text-xs text-zinc-500 font-mono block truncate">
              {cmd.command}
            </code>
          </div>
        ))}

        {visibleCommands.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            <Code className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin comandos guardados</p>
            <p className="text-xs mt-1 text-zinc-400 dark:text-zinc-600">
              Añade tus propios comandos abajo
            </p>
          </div>
        )}
      </div>

      {/* Add Command Button */}
      <div className="p-2 border-t border-zinc-200 dark:border-white/5">
        <button
          onClick={() => openCommandModal()}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Añadir comando</span>
        </button>
      </div>
    </div>
    <ConfirmDialog
      open={!!deleteTarget}
      title="Eliminar comando"
      description={deleteTarget ? `¿Eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.` : ''}
      busy={isDeleting}
      onConfirm={handleConfirmDelete}
      onCancel={() => !isDeleting && setDeleteTarget(null)}
    />
    </>
  );
}
