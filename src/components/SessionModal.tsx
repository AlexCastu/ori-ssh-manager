import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Server, Key, Globe, FileKey } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { SessionColor, AuthMethod } from '../types';

const colors: { value: SessionColor; label: string; class: string }[] = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
];

export function SessionModal() {
  const { sessionModal, closeSessionModal, addSession, updateSession } = useStore();
  const { isDark } = useTheme();

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
    jumpHost: existingSession?.jumpHost || '',
    jumpPort: existingSession?.jumpPort || 22,
    jumpUsername: existingSession?.jumpUsername || '',
    jumpPassword: existingSession?.jumpPassword || '',
    color: existingSession?.color || 'blue' as SessionColor,
  });

  const [showJumpHost, setShowJumpHost] = useState(!!existingSession?.jumpHost);
  const [isLoading, setIsLoading] = useState(false);

  if (!sessionModal.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const sessionData = {
        name: formData.name,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        authMethod: formData.authMethod,
        password: formData.authMethod === 'password' ? formData.password : undefined,
        privateKeyPath: formData.authMethod === 'key' ? formData.privateKeyPath : undefined,
        privateKeyPassphrase: formData.authMethod === 'key' ? formData.privateKeyPassphrase : undefined,
        jumpHost: showJumpHost ? formData.jumpHost : undefined,
        jumpPort: showJumpHost ? formData.jumpPort : undefined,
        jumpUsername: showJumpHost ? formData.jumpUsername : undefined,
        jumpPassword: showJumpHost ? formData.jumpPassword : undefined,
        color: formData.color,
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
        className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl max-h-[90vh] overflow-y-auto ${
          isDark
            ? 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
            : 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b sticky top-0 z-10 ${
          isDark
            ? 'border-[var(--border-secondary)] bg-[var(--bg-elevated)]'
            : 'border-[var(--border-secondary)] bg-[var(--bg-elevated)]'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
              <Server className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {isEdit ? 'Editar Sesión' : 'Nueva Sesión'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {isEdit ? 'Actualizar detalles de la sesión SSH' : 'Añadir una nueva sesión SSH'}
              </p>
            </div>
          </div>
          <button
            onClick={closeSessionModal}
            className={`p-2 rounded-lg transition-colors text-[var(--text-secondary)] ${
              isDark ? 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Nombre de la Sesión
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] ${
                isDark
                  ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                  : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
              }`}
              placeholder="Mi Servidor"
              required
            />
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Host
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] ${
                    isDark
                      ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                      : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                  }`}
                  placeholder="192.168.1.100"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Puerto
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] ${
                  isDark
                    ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                    : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                }`}
                min={1}
                max={65535}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Usuario
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] ${
                isDark
                  ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                  : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
              }`}
              placeholder="root"
              required
            />
          </div>

          {/* Auth Method Toggle */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Método de Autenticación
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'password' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  formData.authMethod === 'password'
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)]/50 text-[var(--accent-primary)]'
                    : isDark
                      ? 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-primary)]'
                      : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'
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
                    ? 'bg-[var(--success-bg)] border-[var(--success)]/50 text-[var(--success)]'
                    : isDark
                      ? 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-primary)]'
                      : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]'
                }`}
              >
                <FileKey className="w-4 h-4" />
                <span className="text-sm">Clave SSH</span>
              </button>
            </div>
          </div>

          {/* Password or SSH Key fields */}
          {formData.authMethod === 'password' ? (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] ${
                    isDark
                      ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                      : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                  }`}
                  placeholder="••••••••"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Ruta de la Clave Privada
                </label>
                <div className="relative">
                  <FileKey className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                  <input
                    type="text"
                    value={formData.privateKeyPath}
                    onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                    className={`w-full pl-9 pr-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--success)] ${
                      isDark
                        ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--success)]/40'
                        : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--success)]/30'
                    }`}
                    placeholder="~/.ssh/id_rsa"
                    required={formData.authMethod === 'key'}
                  />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Ruta completa a tu archivo de clave privada (ej: ~/.ssh/id_rsa)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Frase de Paso (opcional)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                  <input
                    type="password"
                    value={formData.privateKeyPassphrase}
                    onChange={(e) => setFormData({ ...formData, privateKeyPassphrase: e.target.value })}
                    className={`w-full pl-9 pr-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--success)] ${
                      isDark
                        ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--success)]/40'
                        : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--success)]/30'
                    }`}
                    placeholder="Dejar vacío si la clave no tiene frase de paso"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
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
                    ${formData.color === color.value
                      ? isDark
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--bg-secondary)] scale-110'
                        : 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-elevated)] scale-110'
                      : 'hover:scale-105'}
                  `}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Jump Host Toggle */}
          <div className="border-t border-[var(--divider)] pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showJumpHost}
                onChange={(e) => setShowJumpHost(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-primary)] bg-[var(--bg-tertiary)] accent-[var(--accent-primary)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">Usar Host de Salto (Bastión)</span>
            </label>
          </div>

          {/* Jump Host Fields */}
          {showJumpHost && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`space-y-3 p-3 rounded-lg border ${
                isDark
                  ? 'bg-[var(--bg-tertiary)] border-[var(--border-primary)]'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
              }`}
            >
              <div className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Configuración del Host de Salto
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={formData.jumpHost}
                    onChange={(e) => setFormData({ ...formData, jumpHost: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] text-sm ${
                      isDark
                        ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                        : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                    }`}
                    placeholder="Host de Salto"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={formData.jumpPort}
                    onChange={(e) => setFormData({ ...formData, jumpPort: parseInt(e.target.value) || 22 })}
                    className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] text-sm ${
                      isDark
                        ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                        : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                    }`}
                    placeholder="Puerto"
                    min={1}
                    max={65535}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={formData.jumpUsername}
                  onChange={(e) => setFormData({ ...formData, jumpUsername: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] text-sm ${
                    isDark
                      ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                      : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                  }`}
                  placeholder="Usuario"
                />
                <input
                  type="password"
                  value={formData.jumpPassword}
                  onChange={(e) => setFormData({ ...formData, jumpPassword: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:border-[var(--accent-primary)] text-sm ${
                    isDark
                      ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/40'
                      : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] focus:ring-[var(--accent-primary)]/30'
                  }`}
                  placeholder="Contraseña"
                />
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--divider)]">
            <button
              type="button"
              onClick={closeSessionModal}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                isDark
                  ? 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-white/5'
                  : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-black/5'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>{isEdit ? 'Guardar Cambios' : 'Crear Sesión'}</>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
