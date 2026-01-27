import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Server, Key, Globe, FileKey } from 'lucide-react';
import { useStore } from '../store/useStore';
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
        className="relative w-full max-w-lg bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 sticky top-0 bg-zinc-900/90 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isEdit ? 'Edit Session' : 'New Session'}
              </h2>
              <p className="text-sm text-zinc-400">
                {isEdit ? 'Update SSH session details' : 'Add a new SSH session'}
              </p>
            </div>
          </div>
          <button
            onClick={closeSessionModal}
            className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Session Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              placeholder="My Server"
              required
            />
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Host
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  placeholder="192.168.1.100"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Port
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                min={1}
                max={65535}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              placeholder="root"
              required
            />
          </div>

          {/* Auth Method Toggle */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Authentication Method
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'password' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  formData.authMethod === 'password'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'border-white/10 text-zinc-400 hover:border-white/20'
                }`}
              >
                <Key className="w-4 h-4" />
                <span className="text-sm">Password</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, authMethod: 'key' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  formData.authMethod === 'key'
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'border-white/10 text-zinc-400 hover:border-white/20'
                }`}
              >
                <FileKey className="w-4 h-4" />
                <span className="text-sm">SSH Key</span>
              </button>
            </div>
          </div>

          {/* Password or SSH Key fields */}
          {formData.authMethod === 'password' ? (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  placeholder="••••••••"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Private Key Path
                </label>
                <div className="relative">
                  <FileKey className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    value={formData.privateKeyPath}
                    onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                    placeholder="~/.ssh/id_rsa"
                    required={formData.authMethod === 'key'}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Full path to your private key file (e.g., ~/.ssh/id_rsa)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Key Passphrase (optional)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="password"
                    value={formData.privateKeyPassphrase}
                    onChange={(e) => setFormData({ ...formData, privateKeyPassphrase: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                    placeholder="Leave empty if key has no passphrase"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
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
                    ${formData.color === color.value ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : 'hover:scale-105'}
                  `}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Jump Host Toggle */}
          <div className="border-t border-white/5 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showJumpHost}
                onChange={(e) => setShowJumpHost(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-sm text-zinc-300">Use Jump Host (Bastion)</span>
            </label>
          </div>

          {/* Jump Host Fields */}
          {showJumpHost && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 p-3 bg-zinc-800/30 rounded-lg border border-white/5"
            >
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Jump Host Configuration
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={formData.jumpHost}
                    onChange={(e) => setFormData({ ...formData, jumpHost: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                    placeholder="Jump Host"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={formData.jumpPort}
                    onChange={(e) => setFormData({ ...formData, jumpPort: parseInt(e.target.value) || 22 })}
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                    placeholder="Port"
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
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                  placeholder="Username"
                />
                <input
                  type="password"
                  value={formData.jumpPassword}
                  onChange={(e) => setFormData({ ...formData, jumpPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                  placeholder="Password"
                />
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={closeSessionModal}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>{isEdit ? 'Save Changes' : 'Create Session'}</>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
