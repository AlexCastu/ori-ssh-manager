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
    openCommandModal({ command, mode: 'edit', sessionId: activeTab?.sessionId });
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
      <div className="w-10 shrink-0 bg-panel backdrop-blur-2xl border-l border-borde flex flex-col items-center py-2 gap-2">
        <button
          onClick={toggleCommandPanel}
          className="btn-icono"
          title="Mostrar comandos"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Zoom controls in collapsed mode */}
        <div className="flex flex-col gap-1 mt-2">
          <button
            onClick={() => setTerminalZoom(terminalZoom + 0.1)}
            className="btn-icono"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTerminalZoom(1.0)}
            className="btn-icono"
            title="Restablecer zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTerminalZoom(terminalZoom - 0.1)}
            className="btn-icono"
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
    <div className="w-72 shrink-0 bg-panel backdrop-blur-2xl border-l border-borde flex flex-col">
      {/* Header with collapse button */}
      <div className="p-3 border-b border-borde flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Command className="w-4 h-4 text-acento" />
          <span className="text-sm font-semibold text-texto">Comandos</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={() => setTerminalZoom(terminalZoom - 0.1)}
            disabled={terminalZoom <= 0.7}
            className="btn-icono disabled:opacity-30"
            title="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-texto-tenue w-9 text-center tabular-nums">
            {Math.round(terminalZoom * 100)}%
          </span>
          <button
            onClick={() => setTerminalZoom(terminalZoom + 0.1)}
            disabled={terminalZoom >= 1.5}
            className="btn-icono disabled:opacity-30"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleCommandPanel}
            className="btn-icono ml-1"
            title="Ocultar comandos"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>

      {/* Content: only user-saved commands (no preset/default commands, which
          assume a Linux shell and break on Windows and other environments) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {visibleCommands.map((cmd) => (
          <div
            key={cmd.id}
            className="tarjeta group p-2 hover:bg-superficie-hover transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-medium text-texto truncate">
                  {cmd.name}
                </span>
                {cmd.notes ? <NoteBadge notes={cmd.notes} /> : null}
                {cmd.sessionId && (
                  <span
                    className="shrink-0 px-1.5 py-px rounded-full text-[10px] font-semibold uppercase bg-superficie text-acento border border-acento"
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
                  className="btn-icono hover:text-exito disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Ejecutar"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleEdit(cmd)}
                  className="btn-icono"
                  title="Editar"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(cmd)}
                  className="btn-icono hover:text-peligro"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <code className="text-xs text-texto-tenue font-mono block truncate">
              {cmd.command}
            </code>
          </div>
        ))}

        {visibleCommands.length === 0 && (
          <div className="text-center py-8 text-texto-tenue">
            <Code className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin comandos guardados</p>
            <p className="text-xs mt-1 text-texto-tenue">
              Añade tus propios comandos abajo
            </p>
          </div>
        )}
      </div>

      {/* Add Command Button */}
      <div className="p-2 border-t border-borde">
        <button
          onClick={() => openCommandModal({ sessionId: activeTab?.sessionId })}
          className="btn-secundario w-full flex items-center justify-center gap-2"
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
