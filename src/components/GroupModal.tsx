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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-3xl modal-cristal text-texto max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-borde">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-acento to-acento-2 flex items-center justify-center">
              <Folder className="w-5 h-5 text-texto" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-texto">
                {isEdit ? 'Editar carpeta' : 'Nueva carpeta'}
              </h2>
              <p className="text-sm text-texto-suave">
                {isEdit ? 'Actualiza los datos de la carpeta' : 'Crea una carpeta para organizar sesiones'}
              </p>
            </div>
          </div>
          <button
            onClick={closeGroupModal}
            className="btn-icono"
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
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Nombre de la carpeta
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="campo"
              placeholder="Producción"
              autoFocus
              required
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Color
            </label>
            <div className="flex gap-2">
              {colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors ${
                    formData.color === color.value
                      ? 'border-acento bg-superficie-fuerte'
                      : 'border-borde hover:bg-superficie-hover'
                  }`}
                  title={color.label}
                >
                  <span className={`w-5 h-5 rounded-md ${color.class}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Icono
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFormData({ ...formData, icon: name })}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-colors ${
                    formData.icon === name
                      ? 'bg-superficie-fuerte border-acento text-texto'
                      : 'border-borde text-texto-suave hover:border-borde-fuerte hover:bg-superficie-hover'
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
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="campo flex-1 min-h-[120px] resize-none"
              placeholder="Comentarios, contactos, recordatorios..."
            />
          </div>
          </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-borde">
            <button
              type="button"
              onClick={closeGroupModal}
              className="btn-secundario"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primario"
            >
              {isEdit ? 'Guardar cambios' : 'Crear carpeta'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
