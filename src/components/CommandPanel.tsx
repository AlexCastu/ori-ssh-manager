import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Plus,
  Play,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Code,
  Pencil,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useSSHConnection } from '../hooks/useSSHConnection';
import { useTheme } from '../contexts/ThemeContext';

export function CommandPanel() {
  const { commands, tabs, activeTabId, deleteCommand, openCommandModal } = useStore();
  const { send } = useSSHConnection();
  const { isDark } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const canSendCommand = activeTab?.status === 'connected' && activeTab.channelId;

  const executeCommand = async (command: string) => {
    if (!canSendCommand || !activeTab?.channelId) return;
    await send(activeTab.channelId, command + '\n');
  };

  return (
    <motion.div
      className={`backdrop-blur-xl border-l flex flex-col overflow-hidden ${
        isDark
          ? 'bg-zinc-900/50 border-white/5'
          : 'bg-white/80 border-zinc-200'
      }`}
      animate={{ width: isCollapsed ? 48 : 256 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className={`p-2 border-b flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Command className="w-4 h-4 text-blue-400" />
            <span className={`text-sm font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>Quick Commands</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 rounded-lg transition-colors ${
            isDark
              ? 'hover:bg-white/5 text-zinc-400 hover:text-white'
              : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'
          }`}
          title={isCollapsed ? 'Expand commands' : 'Collapse commands'}
        >
          {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Commands List */}
      {!isCollapsed ? (
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className={`group p-2 rounded-lg transition-colors ${
                    isDark ? 'hover:bg-white/5' : 'hover:bg-zinc-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium truncate ${
                      isDark ? 'text-zinc-300' : 'text-zinc-700'
                    }`}>
                      {cmd.name}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => executeCommand(cmd.command)}
                        disabled={!canSendCommand}
                        className={`p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                          isDark
                            ? 'hover:bg-green-500/20 text-zinc-400 hover:text-green-400'
                            : 'hover:bg-green-100 text-zinc-500 hover:text-green-600'
                        }`}
                        title="Run Command"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openCommandModal({ command: cmd, mode: 'edit' })}
                        className={`p-1 rounded transition-colors ${
                          isDark
                            ? 'hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400'
                            : 'hover:bg-blue-100 text-zinc-500 hover:text-blue-600'
                        }`}
                        title="Edit Command"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCommand(cmd.id)}
                        className={`p-1 rounded transition-colors ${
                          isDark
                            ? 'hover:bg-red-500/20 text-zinc-400 hover:text-red-400'
                            : 'hover:bg-red-100 text-zinc-500 hover:text-red-600'
                        }`}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <code className={`text-xs font-mono block truncate ${
                    isDark ? 'text-zinc-500' : 'text-zinc-500'
                  }`}>
                    {cmd.command}
                  </code>
                </div>
              ))}

              {commands.length === 0 && (
                <div className={`text-center py-6 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  <Code className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No saved commands</p>
                </div>
              )}
            </div>

          {/* Add Command Button */}
          <div className={`p-2 border-t ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
            <button
              onClick={() => openCommandModal({ mode: 'create' })}
              className={`w-full flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed transition-colors ${
                isDark
                  ? 'border-white/10 text-zinc-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5'
                  : 'border-zinc-300 text-zinc-500 hover:text-zinc-900 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add Command</span>
            </button>
          </div>
        </div>
      ) : (
        /* Collapsed view - show icons only */
        <div className="flex-1 overflow-y-auto py-2">
          <div className="flex flex-col items-center gap-1">
            {/* Add button */}
            <button
              onClick={() => openCommandModal({ mode: 'create' })}
              className={`p-2 rounded-lg transition-colors ${
                isDark
                  ? 'hover:bg-white/5 text-zinc-400 hover:text-blue-400'
                  : 'hover:bg-zinc-100 text-zinc-500 hover:text-blue-600'
              }`}
              title="Add Command"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Command icons */}
            {commands.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => executeCommand(cmd.command)}
                disabled={!canSendCommand}
                className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  isDark
                    ? 'hover:bg-white/5 text-zinc-400 hover:text-green-400'
                    : 'hover:bg-zinc-100 text-zinc-500 hover:text-green-600'
                }`}
                title={`${cmd.name}\n${cmd.command}`}
              >
                <Code className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
