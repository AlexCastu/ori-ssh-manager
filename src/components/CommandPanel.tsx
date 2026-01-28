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
  Zap,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { sshService } from '../hooks/sshService';

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
  const { commands, tabs, activeTabId, deleteCommand, openCommandModal } = useStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [quickExpanded, setQuickExpanded] = useState(true);

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

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            {/* Quick Access - Default Commands */}
            <div className="border-b border-white/5">
              <button
                onClick={() => setQuickExpanded(!quickExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 uppercase tracking-wider"
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
                    <div className="px-2 pb-2 grid grid-cols-2 gap-1">
                      {DEFAULT_COMMANDS.map((cmd) => (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd.command)}
                          disabled={!canSendCommand}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed group"
                          title={cmd.command}
                        >
                          <Play className="w-3 h-3 text-zinc-600 group-hover:text-green-400 shrink-0" />
                          <span className="text-xs text-zinc-400 group-hover:text-zinc-200 truncate">{cmd.name}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User Saved Commands */}
            <div className="p-2 space-y-1">
              {commands.length > 0 && (
                <div className="px-1 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Saved Commands
                </div>
              )}

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
                <div className="text-center py-4 text-zinc-500">
                  <Code className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
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
