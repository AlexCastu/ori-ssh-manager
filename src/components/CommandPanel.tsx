import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Plus,
  Play,
  Trash2,
  ChevronDown,
  ChevronRight,
  Code,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { sshService } from '../hooks/sshService';

export function CommandPanel() {
  const { commands, tabs, activeTabId, deleteCommand, openCommandModal } = useStore();
  const [isExpanded, setIsExpanded] = useState(true);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const canSendCommand = activeTab?.status === 'connected' && activeTab.channelId;

  const executeCommand = async (command: string) => {
    if (!canSendCommand || !activeTab?.channelId) return;
    await sshService.send(activeTab.channelId, command + '\n');
  };

  return (
    <div className="w-64 bg-zinc-900/50 backdrop-blur-xl border-l border-white/5 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between text-sm font-medium text-zinc-300 hover:text-white"
        >
          <div className="flex items-center gap-2">
            <Command className="w-4 h-4 text-blue-400" />
            <span>Quick Commands</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Commands List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="p-2 space-y-1">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="group p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-zinc-300 truncate">
                      {cmd.name}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => executeCommand(cmd.command)}
                        disabled={!canSendCommand}
                        className="p-1 rounded hover:bg-green-500/20 text-zinc-400 hover:text-green-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Run Command"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCommand(cmd.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                        title="Delete"
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

              {commands.length === 0 && (
                <div className="text-center py-6 text-zinc-500">
                  <Code className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No saved commands</p>
                </div>
              )}
            </div>

            {/* Add Command Button */}
            <div className="p-2 border-t border-white/5">
              <button
                onClick={() => openCommandModal()}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-white/10 text-zinc-400 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add Command</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
