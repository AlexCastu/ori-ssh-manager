import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Server, Key, Globe, Folder, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { SessionColor } from '../types';

// Validation helpers
const isValidIPv4 = (ip: string): boolean => {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
};

const isValidIPv6 = (ip: string): boolean => {
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/;
  return ipv6Regex.test(ip);
};

const isValidHostname = (hostname: string): boolean => {
  // Allow localhost
  if (hostname === 'localhost') return true;
  // Standard hostname validation
  const hostnameRegex = /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*$/;
  return hostnameRegex.test(hostname);
};

const isValidHost = (host: string): boolean => {
  if (!host) return false;
  return isValidIPv4(host) || isValidIPv6(host) || isValidHostname(host);
};

const isValidPort = (port: number): boolean => {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
};

const isValidUsername = (username: string): boolean => {
  // Username should not be empty and not contain spaces or special chars except _ and -
  if (!username) return false;
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  return usernameRegex.test(username);
};

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
  const { sessionModal, closeSessionModal, addSession, updateSession, groups, settings } = useStore();
  const { isDark } = useTheme();

  const isEdit = sessionModal.data?.mode === 'edit';
  const existingSession = sessionModal.data?.session;

  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    jumpHost: '',
    jumpPort: 22,
    jumpUsername: '',
    jumpPassword: '',
    color: 'blue' as SessionColor,
    groupId: '',
  });

  const [showJumpHost, setShowJumpHost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showJumpPassword, setShowJumpPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Use global setting for password visibility
  const passwordVisible = settings.showPasswords || showPassword;
  const jumpPasswordVisible = settings.showPasswords || showJumpPassword;

  // Validate a single field
  const validateField = (name: string, value: string | number): string => {
    switch (name) {
      case 'name':
        if (!value || (typeof value === 'string' && !value.trim())) {
          return 'Session name is required';
        }
        if (typeof value === 'string' && value.length > 50) {
          return 'Name must be less than 50 characters';
        }
        return '';
      case 'host':
        if (!value) {
          return 'Host is required';
        }
        if (typeof value === 'string' && !isValidHost(value)) {
          return 'Enter a valid IP address or hostname';
        }
        return '';
      case 'port':
        if (!isValidPort(Number(value))) {
          return 'Port must be between 1 and 65535';
        }
        return '';
      case 'username':
        if (!value) {
          return 'Username is required';
        }
        if (typeof value === 'string' && !isValidUsername(value)) {
          return 'Username can only contain letters, numbers, _ and -';
        }
        return '';
      case 'jumpHost':
        if (showJumpHost && value && typeof value === 'string' && !isValidHost(value)) {
          return 'Enter a valid IP address or hostname';
        }
        return '';
      case 'jumpPort':
        if (showJumpHost && !isValidPort(Number(value))) {
          return 'Port must be between 1 and 65535';
        }
        return '';
      case 'jumpUsername':
        if (showJumpHost && value && typeof value === 'string' && !isValidUsername(value)) {
          return 'Username can only contain letters, numbers, _ and -';
        }
        return '';
      default:
        return '';
    }
  };

  // Validate all fields
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    newErrors.name = validateField('name', formData.name);
    newErrors.host = validateField('host', formData.host);
    newErrors.port = validateField('port', formData.port);
    newErrors.username = validateField('username', formData.username);

    if (showJumpHost) {
      if (formData.jumpHost) {
        newErrors.jumpHost = validateField('jumpHost', formData.jumpHost);
      }
      newErrors.jumpPort = validateField('jumpPort', formData.jumpPort);
      if (formData.jumpUsername) {
        newErrors.jumpUsername = validateField('jumpUsername', formData.jumpUsername);
      }
    }

    // Filter out empty error messages
    const filteredErrors: Record<string, string> = {};
    Object.entries(newErrors).forEach(([key, value]) => {
      if (value) filteredErrors[key] = value;
    });

    setErrors(filteredErrors);
    return Object.keys(filteredErrors).length === 0;
  };

  // Handle field blur for validation
  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, formData[field as keyof typeof formData]);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  // Handle field change with validation
  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Only validate if field has been touched
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors((prev) => ({ ...prev, [field]: error }));
    }
  };

  // Reset form data when modal opens or session changes
  useEffect(() => {
    if (sessionModal.isOpen) {
      // Reset errors and touched states
      setErrors({});
      setTouched({});

      if (existingSession) {
        setFormData({
          name: existingSession.name || '',
          host: existingSession.host || '',
          port: existingSession.port || 22,
          username: existingSession.username || '',
          password: existingSession.password || '',
          jumpHost: existingSession.jumpHost || '',
          jumpPort: existingSession.jumpPort || 22,
          jumpUsername: existingSession.jumpUsername || '',
          jumpPassword: existingSession.jumpPassword || '',
          color: existingSession.color || 'blue',
          groupId: existingSession.groupId || '',
        });
        setShowJumpHost(!!existingSession.jumpHost);
      } else {
        // Reset to defaults for new session
        setFormData({
          name: '',
          host: '',
          port: 22,
          username: '',
          password: '',
          jumpHost: '',
          jumpPort: 22,
          jumpUsername: '',
          jumpPassword: '',
          color: 'blue',
          groupId: '',
        });
        setShowJumpHost(false);
      }
    }
  }, [sessionModal.isOpen, existingSession]);

  if (!sessionModal.isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched
    setTouched({
      name: true,
      host: true,
      port: true,
      username: true,
      jumpHost: true,
      jumpPort: true,
      jumpUsername: true,
    });

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const sessionData = {
        name: formData.name.trim(),
        host: formData.host.trim(),
        port: formData.port,
        username: formData.username.trim(),
        password: formData.password || undefined,
        jumpHost: showJumpHost ? formData.jumpHost.trim() || undefined : undefined,
        jumpPort: showJumpHost ? formData.jumpPort : undefined,
        jumpUsername: showJumpHost ? formData.jumpUsername.trim() || undefined : undefined,
        jumpPassword: showJumpHost ? formData.jumpPassword || undefined : undefined,
        color: formData.color,
        // Use null for empty groupId to ensure proper serialization to backend
        groupId: formData.groupId || null,
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
        className={`relative w-full max-w-lg backdrop-blur-xl rounded-2xl border shadow-2xl ${
          isDark
            ? 'bg-zinc-900/90 border-white/10'
            : 'bg-white/95 border-zinc-200'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isDark ? 'bg-blue-500/20' : 'bg-blue-100'
            }`}>
              <Server className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isEdit ? 'Edit Session' : 'New Session'}
              </h2>
              <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {isEdit ? 'Update SSH session details' : 'Add a new SSH session'}
              </p>
            </div>
          </div>
          <button
            onClick={closeSessionModal}
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
          {/* Name */}
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Session Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              onBlur={() => handleBlur('name')}
              className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 ${
                isDark
                  ? 'bg-zinc-800/50 text-white border-white/10'
                  : 'bg-zinc-100 text-zinc-900 border-zinc-300'
              } ${errors.name && touched.name ? 'border-red-500/50' : ''}`}
              placeholder="My Server"
            />
            {errors.name && touched.name && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.name}
              </p>
            )}
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Host
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => handleChange('host', e.target.value)}
                  onBlur={() => handleBlur('host')}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 ${
                    isDark
                      ? 'bg-zinc-800/50 text-white border-white/10'
                      : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                  } ${errors.host && touched.host ? 'border-red-500/50' : ''}`}
                  placeholder="192.168.1.100 or server.com"
                />
              </div>
              {errors.host && touched.host && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.host}
                </p>
              )}
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Port
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => handleChange('port', parseInt(e.target.value) || 22)}
                onBlur={() => handleBlur('port')}
                className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 ${
                  isDark
                    ? 'bg-zinc-800/50 text-white border-white/10'
                    : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                } ${errors.port && touched.port ? 'border-red-500/50' : ''}`}
                min={1}
                max={65535}
              />
              {errors.port && touched.port && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.port}
                </p>
              )}
            </div>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                onBlur={() => handleBlur('username')}
                className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 ${
                  isDark
                    ? 'bg-zinc-800/50 text-white border-white/10'
                    : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                } ${errors.username && touched.username ? 'border-red-500/50' : ''}`}
                placeholder="root"
              />
              {errors.username && touched.username && (
                <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.username}
                </p>
              )}
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`w-full pl-9 pr-10 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 ${
                    isDark
                      ? 'bg-zinc-800/50 text-white border-white/10'
                      : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                    isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
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
                      ? `ring-2 ring-offset-2 scale-110 ${isDark ? 'ring-white ring-offset-zinc-900' : 'ring-zinc-800 ring-offset-white'}`
                      : 'hover:scale-105'}
                  `}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Group */}
          {groups.length > 0 && (
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Group
              </label>
              <div className="relative">
                <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <select
                  value={formData.groupId}
                  onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 appearance-none cursor-pointer ${
                    isDark
                      ? 'bg-zinc-800/50 text-white border-white/10'
                      : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                  }`}
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Jump Host Toggle */}
          <div className={`border-t pt-4 ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showJumpHost}
                onChange={(e) => setShowJumpHost(e.target.checked)}
                className={`w-4 h-4 rounded text-blue-500 focus:ring-blue-500/50 ${
                  isDark ? 'border-white/20 bg-zinc-800' : 'border-zinc-300 bg-white'
                }`}
              />
              <span className={`text-sm ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>Use Jump Host (Bastion)</span>
            </label>
          </div>

          {/* Jump Host Fields */}
          {showJumpHost && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`space-y-3 p-3 rounded-lg border ${
                isDark ? 'bg-zinc-800/30 border-white/5' : 'bg-zinc-100 border-zinc-200'
              }`}
            >
              <div className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                Jump Host Configuration
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={formData.jumpHost}
                    onChange={(e) => handleChange('jumpHost', e.target.value)}
                    onBlur={() => handleBlur('jumpHost')}
                    className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm ${
                      isDark
                        ? 'bg-zinc-800/50 text-white border-white/10'
                        : 'bg-white text-zinc-900 border-zinc-300'
                    } ${errors.jumpHost && touched.jumpHost ? 'border-red-500/50' : ''}`}
                    placeholder="192.168.1.1 or bastion.server.com"
                  />
                  {errors.jumpHost && touched.jumpHost && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.jumpHost}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="number"
                    value={formData.jumpPort}
                    onChange={(e) => handleChange('jumpPort', parseInt(e.target.value) || 22)}
                    onBlur={() => handleBlur('jumpPort')}
                    className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm ${
                      isDark
                        ? 'bg-zinc-800/50 text-white border-white/10'
                        : 'bg-white text-zinc-900 border-zinc-300'
                    } ${errors.jumpPort && touched.jumpPort ? 'border-red-500/50' : ''}`}
                    placeholder="Port"
                    min={1}
                    max={65535}
                  />
                  {errors.jumpPort && touched.jumpPort && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.jumpPort}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    value={formData.jumpUsername}
                    onChange={(e) => handleChange('jumpUsername', e.target.value)}
                    onBlur={() => handleBlur('jumpUsername')}
                    className={`w-full px-3 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm ${
                      isDark
                        ? 'bg-zinc-800/50 text-white border-white/10'
                        : 'bg-white text-zinc-900 border-zinc-300'
                    } ${errors.jumpUsername && touched.jumpUsername ? 'border-red-500/50' : ''}`}
                    placeholder="Username"
                  />
                  {errors.jumpUsername && touched.jumpUsername && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.jumpUsername}
                    </p>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={jumpPasswordVisible ? 'text' : 'password'}
                    value={formData.jumpPassword}
                    onChange={(e) => setFormData({ ...formData, jumpPassword: e.target.value })}
                    className={`w-full px-3 pr-10 py-2 border rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm ${
                      isDark
                        ? 'bg-zinc-800/50 text-white border-white/10'
                        : 'bg-white text-zinc-900 border-zinc-300'
                    }`}
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJumpPassword(!showJumpPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                      isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                    }`}
                  >
                    {jumpPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-white/5' : 'border-zinc-200'}`}>
            <button
              type="button"
              onClick={closeSessionModal}
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
