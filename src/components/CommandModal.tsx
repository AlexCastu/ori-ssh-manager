import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Code } from 'lucide-react';
import { useStore } from '../store/useStore';

export function CommandModal() {
  const { commandModal, closeCommandModal, addCommand, updateCommand, activeSessionId } = useStore();

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [isGlobal, setIsGlobal] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const editingCommand = commandModal.data?.mode === 'edit' ? commandModal.data.command : undefined;
  const isEdit = Boolean(editingCommand);

  // Re-sync form state on every open: populate when editing, reset when creating
  useEffect(() => {
    if (!commandModal.isOpen) return;
    setName(editingCommand?.name ?? '');
    setCommand(editingCommand?.command ?? '');
    setIsGlobal(!editingCommand?.sessionId);
  }, [commandModal.isOpen, editingCommand]);

  if (!commandModal.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    const payload = {
      name: name.trim(),
      command: command.trim(),
      sessionId: isGlobal
        ? undefined
        : editingCommand?.sessionId ?? activeSessionId ?? undefined,
    };

    setIsLoading(true);
    try {
      if (editingCommand) {
        await updateCommand(editingCommand.id, payload);
      } else {
        await addCommand(payload);
      }
      closeCommandModal();
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
        className="relative w-full max-w-md bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-zinc-200 dark:border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Code className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{isEdit ? 'Edit Command' : 'Save Command'}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {isEdit ? 'Update this command snippet' : 'Create a quick command snippet'}
              </p>
            </div>
          </div>
          <button
            onClick={closeCommandModal}
            className="p-2 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
              placeholder="List files"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Command
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 font-mono text-sm resize-none"
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
                className="w-4 h-4 rounded border-zinc-300 dark:border-white/20 bg-zinc-100 dark:bg-zinc-800 text-purple-500 focus:ring-purple-500/50"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Global command (available for all sessions)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-white/5">
            <button
              type="button"
              onClick={closeCommandModal}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-900/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !command.trim()}
              className="px-4 py-2 rounded-lg bg-purple-500 text-zinc-900 dark:text-white hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : isEdit ? 'Update Command' : 'Save Command'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
