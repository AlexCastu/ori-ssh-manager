import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Code } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';

export function CommandModal() {
  const { commandModal, closeCommandModal, addCommand, updateCommand } = useStore(
    useShallow((s) => ({
      commandModal: s.commandModal,
      closeCommandModal: s.closeCommandModal,
      addCommand: s.addCommand,
      updateCommand: s.updateCommand,
    }))
  );

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [notes, setNotes] = useState('');
  const [isGlobal, setIsGlobal] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const editingCommand = commandModal.data?.mode === 'edit' ? commandModal.data.command : undefined;
  const sessionId = editingCommand?.sessionId ?? commandModal.data?.sessionId;
  const isEdit = Boolean(editingCommand);

  // Re-sync form state on every open: populate when editing, reset when creating
  useEffect(() => {
    if (!commandModal.isOpen) return;
    setName(editingCommand?.name ?? '');
    setCommand(editingCommand?.command ?? '');
    setNotes(editingCommand?.notes ?? '');
    setIsGlobal(!editingCommand?.sessionId);
  }, [commandModal.isOpen, editingCommand]);

  if (!commandModal.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    const payload = {
      name: name.trim(),
      command: command.trim(),
      notes: notes.trim() || null,
      sessionId: isGlobal ? undefined : sessionId,
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md modal-cristal text-texto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-borde">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-acento to-acento-2 flex items-center justify-center">
              <Code className="w-5 h-5 text-texto" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-texto">{isEdit ? 'Editar comando' : 'Guardar comando'}</h2>
              <p className="text-sm text-texto-suave">
                {isEdit ? 'Actualiza este comando' : 'Crea un comando rápido'}
              </p>
            </div>
          </div>
          <button
            onClick={closeCommandModal}
            className="btn-icono"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="campo"
              placeholder="Listar archivos"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Comando
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              className="campo font-mono text-sm resize-none"
              placeholder="ls -la"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="campo resize-none"
              placeholder="Qué hace, avisos..."
            />
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isGlobal || !sessionId}
                disabled={!sessionId}
                onChange={(e) => setIsGlobal(e.target.checked)}
                className="w-4 h-4 rounded border-borde-fuerte bg-hundido accent-acento focus:ring-acento"
              />
              <span className="text-sm text-texto-suave">
                Comando global (disponible en todas las sesiones)
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-borde">
            <button
              type="button"
              onClick={closeCommandModal}
              className="btn-secundario"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !command.trim()}
              className="btn-primario disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Guardando...' : isEdit ? 'Actualizar comando' : 'Guardar comando'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
