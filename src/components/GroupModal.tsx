import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Folder } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import type { SessionColor, SessionGroup } from '../types';
import { ICON_NAMES } from '../utils/icons';
import { DynamicIcon } from '../utils/IconView';
import { SESSION_COLORS as colors } from '../utils/colors';

// Outer is a thin gate: when the modal opens we remount the inner form via a
// key so its useState initializers pick up the current group (no useEffect
// resync needed — avoids react-hooks/set-state-in-effect).
export function GroupModal() {
  const groupModal = useStore((s) => s.groupModal);
  if (!groupModal.isOpen) return null;
  const data = groupModal.data;
  const key = `${data?.mode ?? 'create'}:${data?.group?.id ?? 'new'}:${data?.parentId ?? ''}`;
  return (
    <GroupModalForm
      key={key}
      mode={data?.mode ?? 'create'}
      group={data?.group}
      parentId={data?.parentId ?? null}
    />
  );
}

function GroupModalForm({
  mode,
  group: existingGroup,
  parentId,
}: {
  mode: 'create' | 'edit';
  group?: SessionGroup;
  parentId: string | null;
}) {
  const { closeGroupModal, addGroup, updateGroup } = useStore(
    useShallow((s) => ({
      closeGroupModal: s.closeGroupModal,
      addGroup: s.addGroup,
      updateGroup: s.updateGroup,
    }))
  );

  const isEdit = mode === 'edit';

  const [formData, setFormData] = useState({
    name: existingGroup?.name || '',
    color: (existingGroup?.color || 'blue') as SessionColor,
    icon: existingGroup?.icon || 'folder',
    notes: existingGroup?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (isEdit && existingGroup) {
      updateGroup(existingGroup.id, {
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon,
        notes: formData.notes || null,
      });
    } else {
      addGroup({
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon,
        isExpanded: true,
        parentId,
        notes: formData.notes || null,
      });
    }

    closeGroupModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeGroupModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-zinc-200 dark:border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {isEdit ? 'Editar carpeta' : 'Nueva carpeta'}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {isEdit ? 'Actualiza los datos de la carpeta' : 'Crea una carpeta para organizar sesiones'}
              </p>
            </div>
          </div>
          <button
            onClick={closeGroupModal}
            className="p-2 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Two columns: details on the left, notes on the right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Nombre de la carpeta
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              placeholder="Producción"
              autoFocus
              required
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Color
            </label>
            <div className="flex gap-2">
              {colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={`w-8 h-8 rounded-lg ${color.class} transition-transform ${
                    formData.color === color.value
                      ? 'ring-2 ring-zinc-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-110'
                      : 'hover:scale-105'
                  }`}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Icono
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon: name })}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                    formData.icon === name
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400'
                      : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
                  }`}
                  title={name}
                >
                  <DynamicIcon name={name} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          </div>

          <div className="space-y-4">
          {/* Notes */}
          <div className="flex flex-col h-full">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full flex-1 min-h-[120px] px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none"
              placeholder="Comentarios, contactos, recordatorios..."
            />
          </div>
          </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-white/5">
            <button
              type="button"
              onClick={closeGroupModal}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-900/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-500 text-zinc-900 dark:text-white hover:bg-blue-600 transition-colors"
            >
              {isEdit ? 'Guardar cambios' : 'Crear carpeta'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
