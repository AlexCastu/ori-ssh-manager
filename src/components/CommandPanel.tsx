import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Plus,
  Play,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronLeft,
  Code,
  Zap,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { sshService } from '../hooks/sshService';
import type { SavedCommand } from '../types';

// Default quick-access commands always available
const DEFAULT_COMMANDS = [
  { id: '_ls', name: 'List files', command: 'ls -la' },
  { id: '_pwd', name: 'Current dir', command: 'pwd' },
  { id: '_whoami', name: 'Who am I', command: 'whoami' },
  { id: '_df', name: 'Disk usage', command: 'df -h' },
  { id: '_free', name: 'Memory', command: 'free -h' },
  { id: '_uptime', name: 'Uptime', command: 'uptime' },
  { id: '_ps', name: 'Processes', command: 'ps aux --sort=-%mem | head -15' },
  { id: '_net', name: 'Network', command: 'ip a 2>/dev/null || ifconfig' },
  { id: '_ports', name: 'Open ports', command: 'ss -tulnp 2>/dev/null || netstat -tulnp' },
  { id: '_uname', name: 'System info', command: 'uname -a' },
];

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
  } = useStore();
  const [quickExpanded, setQuickExpanded] = useState(true);

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

  const handleDelete = async (command: SavedCommand) => {
    if (confirm(`Delete command "${command.name}"?`)) {
      await deleteCommand(command.id);
    }
  };

  // Collapsed state - just show expand button
  if (commandPanelCollapsed) {
    return (
      <div className="w-10 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border-l border-zinc-200 dark:border-white/5 flex flex-col items-center py-2 gap-2">
        <button
          onClick={toggleCommandPanel}
          className="p-2 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          title="Show Commands"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Zoom controls in collapsed mode */}
        <div className="flex flex-col gap-1 mt-2">
          <button
            onClick={() => setTerminalZoom(terminalZoom + 0.1)}
            className="p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTerminalZoom(1.0)}
            className="p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTerminalZoom(terminalZoom - 0.1)}
            className="p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border-l border-zinc-200 dark:border-white/5 flex flex-col">
      {/* Header with collapse button */}
      <div className="p-2 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Command className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Commands</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={() => setTerminalZoom(terminalZoom - 0.1)}
            disabled={terminalZoom <= 0.7}
            className="p-1 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-zinc-500 w-8 text-center">
            {Math.round(terminalZoom * 100)}%
          </span>
          <button
            onClick={() => setTerminalZoom(terminalZoom + 0.1)}
            disabled={terminalZoom >= 1.5}
            className="p-1 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleCommandPanel}
            className="p-1 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors ml-1"
            title="Hide Commands"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick Access - Default Commands */}
        <div className="border-b border-zinc-200 dark:border-white/5">
          <button
            onClick={() => setQuickExpanded(!quickExpanded)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 uppercase tracking-wider"
          >
            <Zap className="w-3 h-3" />
            <span>Quick Access</span>
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${quickExpanded ? '' : '-rotate-90'}`} />
          </button>

          <AnimatePresence>
            {quickExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <div className="px-1.5 pb-1.5 grid grid-cols-2 gap-0.5">
                  {DEFAULT_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => executeCommand(cmd.command)}
                      disabled={!canSendCommand}
                      className="flex items-center gap-1 px-1.5 py-1 rounded text-left transition-colors hover:bg-zinc-900/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed group"
                      title={cmd.command}
                    >
                      <Play className="w-2.5 h-2.5 text-zinc-400 dark:text-zinc-600 group-hover:text-green-600 dark:group-hover:text-green-400 shrink-0" />
                      <span className="text-[10px] text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200 truncate">{cmd.name}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Saved Commands */}
        <div className="p-1.5 space-y-0.5">
          {visibleCommands.length > 0 && (
            <div className="px-1 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
              Saved
            </div>
          )}

          {visibleCommands.map((cmd) => (
            <div
              key={cmd.id}
              className="group p-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                    {cmd.name}
                  </span>
                  {cmd.sessionId && (
                    <span
                      className="shrink-0 px-1 rounded text-[8px] font-semibold uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400"
                      title="Only visible for its session"
                    >
                      Session
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => executeCommand(cmd.command)}
                    disabled={!canSendCommand}
                    className="p-0.5 rounded hover:bg-green-500/20 text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Run"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleEdit(cmd)}
                    className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(cmd)}
                    className="p-0.5 rounded hover:bg-red-500/20 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <code className="text-[10px] text-zinc-500 font-mono block truncate">
                {cmd.command}
              </code>
            </div>
          ))}

          {visibleCommands.length === 0 && (
            <div className="text-center py-3 text-zinc-500">
              <Code className="w-4 h-4 mx-auto mb-1 opacity-50" />
              <p className="text-[10px]">No saved commands</p>
            </div>
          )}
        </div>

        {/* Add Command Button */}
        <div className="p-1.5 border-t border-zinc-200 dark:border-white/5">
          <button
            onClick={() => openCommandModal()}
            className="w-full flex items-center justify-center gap-1.5 p-1.5 rounded border border-dashed border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-xs">Add Command</span>
          </button>
        </div>
      </div>
    </div>
  );
}
