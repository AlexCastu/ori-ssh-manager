import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Server, Key, Globe, FileKey, KeyRound, Plus, Trash2, Circle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import type { SessionColor, AuthMethod, JumpHop } from '../types';
import { ICON_NAMES } from '../utils/icons';
import { DynamicIcon } from '../utils/IconView';
import { SESSION_COLORS as colors } from '../utils/colors';

const emptyHop = (): JumpHop => ({
  name: '',
  refSessionId: null,
  host: '',
  port: 22,
  username: '',
  authMethod: 'password',
  password: '',
  privateKeyPath: '',
  privateKeyPassphrase: '',
});

// Hops come back from the backend without secrets; the form needs
// controlled string values
const toFormHops = (hops?: JumpHop[]): JumpHop[] =>
  (hops ?? []).map((hop) => ({
    ...hop,
    name: hop.name || '',
    password: hop.password || '',
    privateKeyPath: hop.privateKeyPath || '',
    privateKeyPassphrase: hop.privateKeyPassphrase || '',
  }));

export function SessionModal() {
  const { sessionModal, closeSessionModal, addSession, updateSession, sessions } = useStore(
    useShallow((s) => ({
      sessionModal: s.sessionModal,
      closeSessionModal: s.closeSessionModal,
      addSession: s.addSession,
      updateSession: s.updateSession,
      sessions: s.sessions,
    }))
  );

  const isEdit = sessionModal.data?.mode === 'edit';
  const existingSession = sessionModal.data?.session;

  // Other sessions marked "usar como máquina de salto" (exclude self)
  const jumpSessions = sessions.filter(
    (s) => s.usableAsJump && s.id !== existingSession?.id
  );

  const [formData, setFormData] = useState({
    name: existingSession?.name || '',
    host: existingSession?.host || '',
    port: existingSession?.port || 22,
    username: existingSession?.username || '',
    authMethod: (existingSession?.authMethod || 'password') as AuthMethod,
    password: existingSession?.password || '',
    privateKeyPath: existingSession?.privateKeyPath || '',
    privateKeyPassphrase: existingSession?.privateKeyPassphrase || '',
    jumpHops: toFormHops(existingSession?.jumpHops),
    usableAsJump: existingSession?.usableAsJump ?? false,
    color: existingSession?.color || 'blue' as SessionColor,
    icon: existingSession?.icon || '',
    notes: existingSession?.notes || '',
  });

  const [showJumpHost, setShowJumpHost] = useState(!!existingSession?.jumpHops?.length);
  const [isLoading, setIsLoading] = useState(false);

  // Re-sync form state every time the modal opens (the component stays
  // mounted, so initial useState values only apply on the very first render)
  useEffect(() => {
    if (!sessionModal.isOpen) return;
    const s = sessionModal.data?.session;
    setFormData({
      name: s?.name || '',
      host: s?.host || '',
      port: s?.port || 22,
      username: s?.username || '',
      authMethod: (s?.authMethod || 'password') as AuthMethod,
      password: s?.password || '',
      privateKeyPath: s?.privateKeyPath || '',
      privateKeyPassphrase: s?.privateKeyPassphrase || '',
      jumpHops: toFormHops(s?.jumpHops),
      usableAsJump: s?.usableAsJump ?? false,
      color: s?.color || ('blue' as SessionColor),
      icon: s?.icon || '',
      notes: s?.notes || '',
    });
    setShowJumpHost(!!s?.jumpHops?.length);
  }, [sessionModal.isOpen, sessionModal.data]);

  if (!sessionModal.isOpen) return null;

  const updateHop = (index: number, updates: Partial<JumpHop>) => {
    setFormData((prev) => ({
      ...prev,
      jumpHops: prev.jumpHops.map((hop, i) => (i === index ? { ...hop, ...updates } : hop)),
    }));
  };

  const addHop = () => {
    setFormData((prev) => ({ ...prev, jumpHops: [...prev.jumpHops, emptyHop()] }));
  };

  const removeHop = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      jumpHops: prev.jumpHops.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Empty secret fields mean "keep the stored value" (backend preserves them);
      // stored secrets are never sent back to the frontend
      const jumpHops = showJumpHost
        ? formData.jumpHops
            .filter((hop) => hop.refSessionId || hop.host.trim())
            .map((hop) =>
              hop.refSessionId
                ? {
                    // Live reference: only the id (+ optional label) is stored;
                    // the backend resolves the rest from the referenced session.
                    name: hop.name?.trim() || undefined,
                    refSessionId: hop.refSessionId,
                    host: '',
                    port: 22,
                    username: '',
                    authMethod: 'password' as const,
                  }
                : {
                    name: hop.name?.trim() || undefined,
                    host: hop.host.trim(),
                    port: hop.port || 22,
                    username: hop.username.trim(),
                    authMethod: hop.authMethod,
                    password:
                      hop.authMethod === 'password' ? hop.password || undefined : undefined,
                    privateKeyPath:
                      hop.authMethod === 'key' ? hop.privateKeyPath || undefined : undefined,
                    privateKeyPassphrase:
                      hop.authMethod === 'key' ? hop.privateKeyPassphrase || undefined : undefined,
                  }
            )
        : [];

      const sessionData = {
        name: formData.name,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        authMethod: formData.authMethod,
        password: formData.authMethod === 'password' ? formData.password || undefined : undefined,
        privateKeyPath: formData.authMethod === 'key' ? formData.privateKeyPath : undefined,
        privateKeyPassphrase: formData.authMethod === 'key' ? formData.privateKeyPassphrase || undefined : undefined,
        jumpHops,
        usableAsJump: formData.usableAsJump,
        color: formData.color,
        icon: formData.icon || null,
        notes: formData.notes || null,
      };

      if (isEdit && existingSession) {
        await updateSession(existingSession.id, sessionData);
      } else {
        await addSession(sessionData);
      }

      closeSessionModal();
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
        onClick={() => !isLoading && closeSessionModal()}
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
        <div className="flex items-center justify-between p-4 border-b border-borde sticky top-0 bg-modal backdrop-blur-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-acento to-acento-2 flex items-center justify-center">
              <Server className="w-5 h-5 text-texto" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-texto">
                {isEdit ? 'Editar sesión' : 'Nueva sesión'}
              </h2>
              <p className="text-sm text-texto-suave">
                {isEdit ? 'Actualiza los datos de la sesión SSH' : 'Añade una nueva sesión SSH'}
              </p>
            </div>
          </div>
          <button
            onClick={closeSessionModal}
            disabled={isLoading}
            className="btn-icono"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Two columns: connection on the left, appearance on the right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Nombre de la sesión
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="campo"
              placeholder="Mi servidor"
              required
            />
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
                Servidor
              </label>
              <div className="relative">
                <Globe className="absolute left-3 inset-y-0 my-auto w-4 h-4 text-texto-tenue" />
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="campo pl-9"
                  placeholder="192.168.1.100"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
                Puerto
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="campo"
                min={1}
                max={65535}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Usuario
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="campo"
              placeholder="root"
              required
            />
          </div>

          {/* Auth Method Toggle */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-2">
              Método de autenticación
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'password' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                  formData.authMethod === 'password'
                    ? 'bg-superficie-fuerte border-acento text-texto'
                    : 'border-borde text-texto-suave hover:border-borde-fuerte hover:bg-superficie-hover'
                }`}
              >
                <Key className="w-4 h-4" />
                <span className="text-sm">Contraseña</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'key' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                  formData.authMethod === 'key'
                    ? 'bg-superficie-fuerte border-acento text-texto'
                    : 'border-borde text-texto-suave hover:border-borde-fuerte hover:bg-superficie-hover'
                }`}
              >
                <FileKey className="w-4 h-4" />
                <span className="text-sm">Clave SSH</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'agent' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                  formData.authMethod === 'agent'
                    ? 'bg-superficie-fuerte border-acento text-texto'
                    : 'border-borde text-texto-suave hover:border-borde-fuerte hover:bg-superficie-hover'
                }`}
                title="Usar el ssh-agent en ejecución (sin guardar credenciales)"
              >
                <KeyRound className="w-4 h-4" />
                <span className="text-sm">Agente</span>
              </button>
            </div>
          </div>

          {/* Password / SSH Key / Agent fields */}
          {formData.authMethod === 'agent' ? (
            <p className="text-xs text-texto-tenue">
              Autenticación mediante el ssh-agent en ejecución. No se guarda ninguna credencial.
            </p>
          ) : formData.authMethod === 'password' ? (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Key className="absolute left-3 inset-y-0 my-auto w-4 h-4 text-texto-tenue" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="campo pl-9"
                  placeholder={isEdit ? 'Dejar vacío para mantener la actual' : '••••••••'}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
                  Ruta de la clave privada
                </label>
                <div className="relative">
                  <FileKey className="absolute left-3 inset-y-0 my-auto w-4 h-4 text-texto-tenue" />
                  <input
                    type="text"
                    value={formData.privateKeyPath}
                    onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                    className="campo pl-9"
                    placeholder="~/.ssh/id_rsa"
                    required={formData.authMethod === 'key'}
                  />
                </div>
                <p className="text-xs text-texto-tenue mt-1">
                  Ruta completa del archivo de clave privada (p. ej., ~/.ssh/id_rsa)
                </p>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
                  Frase de contraseña de la clave (opcional)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 inset-y-0 my-auto w-4 h-4 text-texto-tenue" />
                  <input
                    type="password"
                    value={formData.privateKeyPassphrase}
                    onChange={(e) => setFormData({ ...formData, privateKeyPassphrase: e.target.value })}
                    className="campo pl-9"
                    placeholder={isEdit ? 'Dejar vacío para mantener la actual' : 'Dejar vacío si la clave no tiene frase de contraseña'}
                  />
                </div>
              </div>
            </div>
          )}
          </div>

          <div className="space-y-4">
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
                  className={`
                    w-8 h-8 rounded-xl border flex items-center justify-center transition-colors
                    ${formData.color === color.value ? 'border-acento bg-superficie-fuerte' : 'border-borde hover:bg-superficie-hover'}
                  `}
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
              {/* "Dot" = no icon: keep the classic colored dot in the sidebar */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, icon: '' })}
                className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-colors ${
                  formData.icon === ''
                    ? 'bg-superficie-fuerte border-acento text-texto'
                    : 'border-borde text-texto-tenue hover:border-borde-fuerte hover:bg-superficie-hover'
                }`}
                title="Punto (sin icono)"
              >
                <Circle className="w-3 h-3 fill-current" />
              </button>
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

          {/* Notes */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-texto-tenue mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="campo resize-none"
              placeholder="Comentarios, contactos, recordatorios..."
            />
          </div>
          </div>
          </div>

          {/* Jump Host Toggle */}
          <div className="border-t border-borde pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showJumpHost}
                onChange={(e) => {
                  setShowJumpHost(e.target.checked);
                  if (e.target.checked && formData.jumpHops.length === 0) {
                    addHop();
                  }
                }}
                className="w-4 h-4 rounded border-borde-fuerte bg-hundido accent-acento focus:ring-acento"
              />
              <span className="text-sm text-texto-suave">
                Usar saltos (cadena de máquinas de salto)
              </span>
            </label>
          </div>

          {/* This session can itself be reused as a jump host by others */}
          <div className="border-t border-borde pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.usableAsJump}
                onChange={(e) => setFormData({ ...formData, usableAsJump: e.target.checked })}
                className="w-4 h-4 rounded border-borde-fuerte bg-hundido accent-acento focus:ring-acento"
              />
              <span className="text-sm text-texto-suave">
                Usar como máquina de salto
                <span className="block text-xs text-texto-tenue">
                  Otras sesiones podrán elegir esta como salto para llegar a su destino
                </span>
              </span>
            </label>
          </div>

          {/* Jump chain: connection goes hop 1 → hop 2 → ... → target */}
          {showJumpHost && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              {formData.jumpHops.map((hop, index) => (
                <div
                  key={index}
                  className="tarjeta space-y-3 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-texto-tenue uppercase tracking-wider">
                      Salto {index + 1} de {formData.jumpHops.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHop(index)}
                      className="btn-icono hover:text-peligro"
                      title="Eliminar salto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={hop.name ?? ''}
                    onChange={(e) => updateHop(index, { name: e.target.value })}
                    className="campo"
                    placeholder="Nombre del salto (opcional, p. ej. Bastión DMZ)"
                  />
                  {jumpSessions.length > 0 && (
                    <div className="flex gap-1 rounded-full bg-hundido p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => updateHop(index, { refSessionId: null })}
                        className={`flex-1 rounded-full border px-2 py-1 transition-colors ${
                          !hop.refSessionId
                            ? 'border-acento bg-superficie-fuerte text-texto'
                            : 'border-transparent text-texto-tenue hover:bg-superficie-hover'
                        }`}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateHop(index, { refSessionId: hop.refSessionId ?? jumpSessions[0].id })
                        }
                        className={`flex-1 rounded-full border px-2 py-1 transition-colors ${
                          hop.refSessionId
                            ? 'border-acento bg-superficie-fuerte text-texto'
                            : 'border-transparent text-texto-tenue hover:bg-superficie-hover'
                        }`}
                      >
                        Máquina de salto
                      </button>
                    </div>
                  )}
                  {hop.refSessionId ? (
                    <select
                      value={hop.refSessionId}
                      onChange={(e) => updateHop(index, { refSessionId: e.target.value })}
                      className="campo"
                    >
                      {jumpSessions.map((js) => (
                        <option key={js.id} value={js.id}>
                          {js.name} — {js.username}@{js.host}:{js.port}
                        </option>
                      ))}
                    </select>
                  ) : (
                  <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={hop.host}
                        onChange={(e) => updateHop(index, { host: e.target.value })}
                        className="campo"
                        placeholder="Servidor del bastión"
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={hop.port}
                        onChange={(e) =>
                          updateHop(index, { port: parseInt(e.target.value) || 22 })
                        }
                        className="campo"
                        placeholder="Puerto"
                        min={1}
                        max={65535}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={hop.username}
                      onChange={(e) => updateHop(index, { username: e.target.value })}
                      className="campo"
                      placeholder="Usuario (vacío = el de la sesión)"
                    />
                    <select
                      value={hop.authMethod}
                      onChange={(e) =>
                        updateHop(index, { authMethod: e.target.value as AuthMethod })
                      }
                      className="campo"
                    >
                      <option value="password">Contraseña</option>
                      <option value="key">Clave SSH</option>
                      <option value="agent">Agente SSH</option>
                    </select>
                  </div>
                  {hop.authMethod === 'password' && (
                    <div>
                      <input
                        type="password"
                        value={hop.password}
                        onChange={(e) => updateHop(index, { password: e.target.value })}
                        className="campo"
                        placeholder={isEdit ? 'Vacío = mantener actual' : 'Contraseña'}
                      />
                      {isEdit && !hop.password && !existingSession?.jumpHops?.some(
                        (stored) => !stored.refSessionId
                          && stored.host === hop.host
                          && stored.port === hop.port
                          && stored.username === hop.username
                      ) && (
                        <p className="text-xs text-aviso mt-1">
                          Este salto es nuevo o ha cambiado. Escribe la contraseña.
                        </p>
                      )}
                    </div>
                  )}
                  {hop.authMethod === 'key' && (
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={hop.privateKeyPath}
                        onChange={(e) => updateHop(index, { privateKeyPath: e.target.value })}
                        className="campo"
                        placeholder="~/.ssh/id_rsa"
                      />
                      <input
                        type="password"
                        value={hop.privateKeyPassphrase}
                        onChange={(e) =>
                          updateHop(index, { privateKeyPassphrase: e.target.value })
                        }
                        className="campo"
                        placeholder={isEdit ? 'Frase de contraseña (vacío = mantener)' : 'Frase de contraseña (opcional)'}
                      />
                    </div>
                  )}
                  </>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addHop}
                className="btn-secundario w-full flex items-center justify-center gap-2 text-sm hover:border-acento hover:text-acento"
              >
                <Plus className="w-4 h-4" />
                Añadir salto
              </button>
              {formData.jumpHops.length > 0 && (
                <p className="text-xs text-texto-tenue">
                  Conexión: {formData.jumpHops.map((h) => h.host || '¿?').join(' → ')} →{' '}
                  {formData.host || 'destino'}
                </p>
              )}
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-borde">
            <button
              type="button"
              onClick={closeSessionModal}
              disabled={isLoading}
              className="btn-secundario"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primario disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-borde-fuerte border-t-texto rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{isEdit ? 'Guardar cambios' : 'Crear sesión'}</>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
