import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Code, FolderOpen, Cpu, Network, Container, FileText, MoreHorizontal } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { CommandCategory } from '../types';

const CATEGORIES: { id: CommandCategory; label: string; icon: React.ElementType }[] = [
  { id: 'files', label: 'Archivos', icon: FolderOpen },
  { id: 'system', label: 'Sistema', icon: Cpu },
  { id: 'network', label: 'Red', icon: Network },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'logs', label: 'Logs', icon: FileText },
  { id: 'other', label: 'Otros', icon: MoreHorizontal },
];

export function CommandModal() {
  const { commandModal, closeCommandModal, addCommand, activeSessionId } = useStore();
  const { isDark } = useTheme();

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [category, setCategory] = useState<CommandCategory>('other');
  const [isGlobal, setIsGlobal] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  if (!commandModal.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    setIsLoading(true);
    try {
      await addCommand({
        name: name.trim(),
        command: command.trim(),
        category,
        sessionId: isGlobal ? undefined : activeSessionId || undefined,
      });
      closeCommandModal();
      setName('');
      setCommand('');
      setCategory('other');
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
        className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl ${
          isDark
            ? 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
            : 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/20 flex items-center justify-center">
              <Code className="w-5 h-5 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Guardar Comando</h2>
              <p className="text-sm text-[var(--text-tertiary)]">Crear un comando rápido</p>
            </div>
          </div>
          <button
            onClick={closeCommandModal}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] ${
                isDark
                  ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                  : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
              }`}
              placeholder="Listar archivos"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Comando
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] font-mono text-sm resize-none ${
                isDark
                  ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                  : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
              }`}
              placeholder="ls -la"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Categoría
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      category === cat.id
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                        : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
                className={`w-4 h-4 rounded focus:ring-[var(--accent-primary)]/50 ${
                  isDark
                    ? 'border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[var(--accent-primary)]'
                }`}
              />
              <span className="text-sm text-[var(--text-secondary)]">
                Comando global (disponible para todas las sesiones)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className={`flex justify-end gap-3 pt-4 border-t ${
            isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'
          }`}>
            <button
              type="button"
              onClick={closeCommandModal}
              className="px-4 py-2 rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !command.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Guardando...' : 'Guardar Comando'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
