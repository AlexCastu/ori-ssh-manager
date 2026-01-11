import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Code } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';

export function CommandModal() {
  const { commandModal, closeCommandModal, addCommand, updateCommand, activeSessionId } = useStore();
  const { isDark } = useTheme();

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [isGlobal, setIsGlobal] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const isEditMode = commandModal.data?.mode === 'edit' && commandModal.data?.command;
  const editingCommand = commandModal.data?.command;

  // Populate form when editing
  useEffect(() => {
    if (isEditMode && editingCommand) {
      setName(editingCommand.name);
      setCommand(editingCommand.command);
      setIsGlobal(!editingCommand.sessionId);
    } else {
      setName('');
      setCommand('');
      setIsGlobal(true);
    }
  }, [isEditMode, editingCommand]);

  if (!commandModal.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    setIsLoading(true);
    try {
      if (isEditMode && editingCommand) {
        await updateCommand(editingCommand.id, {
          name: name.trim(),
          command: command.trim(),
          sessionId: isGlobal ? undefined : activeSessionId || undefined,
        });
      } else {
        await addCommand({
          name: name.trim(),
          command: command.trim(),
          sessionId: isGlobal ? undefined : activeSessionId || undefined,
        });
      }
      closeCommandModal();
      setName('');
      setCommand('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeCommandModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`relative w-full max-w-md backdrop-blur-xl rounded-2xl border shadow-2xl ${
          isDark
            ? 'bg-zinc-900/90 border-white/10'
            : 'bg-white/95 border-zinc-200'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isDark ? 'bg-purple-500/20' : 'bg-purple-100'
            }`}>
              <Code className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isEditMode ? 'Edit Command' : 'Save Command'}
              </h2>
              <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {isEditMode ? 'Modify your command snippet' : 'Create a quick command snippet'}
              </p>
            </div>
          </div>
          <button
            onClick={closeCommandModal}
            className={`p-2 rounded-lg transition-colors ${
              isDark
                ? 'hover:bg-white/5 text-zinc-400 hover:text-white'
                : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 ${
                isDark
                  ? 'bg-zinc-800/50 text-white border-white/10'
                  : 'bg-zinc-100 text-zinc-900 border-zinc-300'
              }`}
              placeholder="List Files"
              required
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Command
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 font-mono text-sm resize-none ${
                isDark
                  ? 'bg-zinc-800/50 text-white border-white/10'
                  : 'bg-zinc-100 text-zinc-900 border-zinc-300'
              }`}
              placeholder="ls -la"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
                className={`w-4 h-4 rounded text-purple-500 focus:ring-purple-500/50 ${
                  isDark ? 'border-white/20 bg-zinc-800' : 'border-zinc-300 bg-white'
                }`}
              />
              <span className={`text-sm ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Global command (available for all sessions)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
            <button
              type="button"
              onClick={closeCommandModal}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                isDark
                  ? 'border-white/10 text-zinc-300 hover:bg-white/5'
                  : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !command.trim()}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : isEditMode ? 'Update Command' : 'Save Command'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
