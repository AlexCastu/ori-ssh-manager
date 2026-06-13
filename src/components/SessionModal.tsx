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
    password: hop.password || '',
    privateKeyPath: hop.privateKeyPath || '',
    privateKeyPassphrase: hop.privateKeyPassphrase || '',
  }));

export function SessionModal() {
  const { sessionModal, closeSessionModal, addSession, updateSession } = useStore(
    useShallow((s) => ({
      sessionModal: s.sessionModal,
      closeSessionModal: s.closeSessionModal,
      addSession: s.addSession,
      updateSession: s.updateSession,
    }))
  );

  const isEdit = sessionModal.data?.mode === 'edit';
  const existingSession = sessionModal.data?.session;

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
            .filter((hop) => hop.host.trim())
            .map((hop) => ({
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
            }))
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
        onClick={closeSessionModal}
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
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-white/5 sticky top-0 bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {isEdit ? 'Editar sesión' : 'Nueva sesión'}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {isEdit ? 'Actualiza los datos de la sesión SSH' : 'Añade una nueva sesión SSH'}
              </p>
            </div>
          </div>
          <button
            onClick={closeSessionModal}
            className="p-2 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
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
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Nombre de la sesión
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              placeholder="Mi servidor"
              required
            />
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Host
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  placeholder="192.168.1.100"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Port
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                min={1}
                max={65535}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Usuario
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              placeholder="root"
              required
            />
          </div>

          {/* Auth Method Toggle */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Método de autenticación
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'password' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  formData.authMethod === 'password'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400'
                    : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                <Key className="w-4 h-4" />
                <span className="text-sm">Contraseña</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'key' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  formData.authMethod === 'key'
                    ? 'bg-green-500/20 border-green-500/50 text-green-600 dark:text-green-400'
                    : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                <FileKey className="w-4 h-4" />
                <span className="text-sm">Clave SSH</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'agent' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  formData.authMethod === 'agent'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-600 dark:text-purple-400'
                    : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
                title="Use the running ssh-agent (no credentials stored)"
              >
                <KeyRound className="w-4 h-4" />
                <span className="text-sm">Agente</span>
              </button>
            </div>
          </div>

          {/* Password / SSH Key / Agent fields */}
          {formData.authMethod === 'agent' ? (
            <p className="text-xs text-zinc-500">
              Autenticación mediante el ssh-agent en ejecución. No se guarda ninguna credencial.
            </p>
          ) : formData.authMethod === 'password' ? (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  placeholder={isEdit ? 'Dejar vacío para mantener la actual' : '••••••••'}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Ruta de la clave privada
                </label>
                <div className="relative">
                  <FileKey className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={formData.privateKeyPath}
                    onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                    placeholder="~/.ssh/id_rsa"
                    required={formData.authMethod === 'key'}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Full path to your private key file (e.g., ~/.ssh/id_rsa)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Passphrase de la clave (opcional)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    value={formData.privateKeyPassphrase}
                    onChange={(e) => setFormData({ ...formData, privateKeyPassphrase: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                    placeholder={isEdit ? 'Dejar vacío para mantener la actual' : 'Leave empty if key has no passphrase'}
                  />
                </div>
              </div>
            </div>
          )}
          </div>

          <div className="space-y-4">
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
                  className={`
                    w-8 h-8 rounded-lg ${color.class} transition-transform
                    ${formData.color === color.value ? 'ring-2 ring-zinc-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-110' : 'hover:scale-105'}
                  `}
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
              {/* "Dot" = no icon: keep the classic colored dot in the sidebar */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, icon: '' })}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                  formData.icon === ''
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-600 dark:text-blue-400'
                    : 'border-zinc-200 dark:border-white/10 text-zinc-500 hover:border-zinc-300 dark:hover:border-white/20'
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

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none"
              placeholder="Comentarios, contactos, recordatorios..."
            />
          </div>
          </div>
          </div>

          {/* Jump Host Toggle */}
          <div className="border-t border-zinc-200 dark:border-white/5 pt-4">
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
                className="w-4 h-4 rounded border-zinc-300 dark:border-white/20 bg-zinc-100 dark:bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Usar saltos (cadena de bastiones)
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
                  className="space-y-3 p-3 bg-zinc-100/80 dark:bg-zinc-800/30 rounded-lg border border-zinc-200 dark:border-white/5"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Salto {index + 1} de {formData.jumpHops.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHop(index)}
                      className="p-1 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/10 text-zinc-500 hover:text-red-500 transition-colors"
                      title="Eliminar salto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={hop.host}
                        onChange={(e) => updateHop(index, { host: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                        placeholder="Host del bastión"
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
                        className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                        placeholder="Port"
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
                      className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                      placeholder="Username (vacío = el de la sesión)"
                    />
                    <select
                      value={hop.authMethod}
                      onChange={(e) =>
                        updateHop(index, { authMethod: e.target.value as AuthMethod })
                      }
                      className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                    >
                      <option value="password">Password</option>
                      <option value="key">SSH Key</option>
                      <option value="agent">SSH Agent</option>
                    </select>
                  </div>
                  {hop.authMethod === 'password' && (
                    <input
                      type="password"
                      value={hop.password}
                      onChange={(e) => updateHop(index, { password: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                      placeholder={isEdit ? 'Vacío = mantener actual' : 'Password'}
                    />
                  )}
                  {hop.authMethod === 'key' && (
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={hop.privateKeyPath}
                        onChange={(e) => updateHop(index, { privateKeyPath: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 text-sm"
                        placeholder="~/.ssh/id_rsa"
                      />
                      <input
                        type="password"
                        value={hop.privateKeyPassphrase}
                        onChange={(e) =>
                          updateHop(index, { privateKeyPassphrase: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 text-sm"
                        placeholder={isEdit ? 'Passphrase (vacío = mantener)' : 'Passphrase (opcional)'}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addHop}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-white/15 text-sm text-zinc-600 dark:text-zinc-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Añadir salto
              </button>
              {formData.jumpHops.length > 0 && (
                <p className="text-xs text-zinc-500">
                  Conexión: {formData.jumpHops.map((h) => h.host || '¿?').join(' → ')} →{' '}
                  {formData.host || 'destino'}
                </p>
              )}
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-white/5">
            <button
              type="button"
              onClick={closeSessionModal}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-900/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-blue-500 text-zinc-900 dark:text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-300 dark:border-white/30 border-t-white rounded-full animate-spin" />
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
