import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Plus,
  Play,
  Trash2,
  ChevronDown,
  Code,
  Zap,
  FolderOpen,
  Cpu,
  Network,
  Container,
  FileText,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { sshService } from '../hooks/sshService';
import { useTheme } from '../contexts/ThemeContext';

// Categorías de comandos con sus iconos y etiquetas
const CATEGORIES: Record<string, { icon: typeof FolderOpen; label: string; color: string }> = {
  files: { icon: FolderOpen, label: 'Archivos', color: 'text-[var(--file-folder)]' },
  system: { icon: Cpu, label: 'Sistema', color: 'text-[var(--accent-primary)]' },
  network: { icon: Network, label: 'Red', color: 'text-[var(--success)]' },
  docker: { icon: Container, label: 'Docker', color: 'text-blue-400' },
  logs: { icon: FileText, label: 'Logs', color: 'text-[var(--warning)]' },
  other: { icon: Code, label: 'Otros', color: 'text-[var(--text-tertiary)]' },
};

// Default quick-access commands - simple and common
const DEFAULT_COMMANDS = [
  // Archivos
  { id: '_ls', name: 'Listar', command: 'ls -la', category: 'files' },
  { id: '_pwd', name: 'Ruta actual', command: 'pwd', category: 'files' },
  // Sistema
  { id: '_clear', name: 'Limpiar consola', command: 'clear', category: 'system' },
  { id: '_df', name: 'Disco', command: 'df -h', category: 'system' },
  // Red
  { id: '_ping', name: 'Ping Google', command: 'ping -c 4 google.com', category: 'network' },
  { id: '_ip', name: 'Mi IP', command: 'hostname -I 2>/dev/null || ipconfig getifaddr en0', category: 'network' },
  // Docker
  { id: '_docker', name: 'Contenedores', command: 'docker ps', category: 'docker' },
  { id: '_logs', name: 'Logs contenedor', command: 'docker logs --tail 50', category: 'docker' },
];

export function CommandPanel() {
  const {
    commands,
    tabs,
    activeTabId,
    deleteCommand,
    openCommandModal,
    commandPanelCollapsed,
  } = useStore();
  const { isDark } = useTheme();
  const [quickExpanded, setQuickExpanded] = useState(true);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const canSendCommand = activeTab?.status === 'connected' && activeTab.channelId;

  const executeCommand = async (command: string) => {
    if (!canSendCommand || !activeTab?.channelId) return;
    // Enviar el comando con salto de línea al final
    // Añadimos un echo vacío antes para dar espacio visual entre comandos
    await sshService.send(activeTab.channelId, '\n' + command + '\n');
  };

  // Collapsed state - just show expand button
  if (commandPanelCollapsed) {
    return null;
  }

  return (
    <div className={`w-60 border-l flex flex-col ${
      isDark
        ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
        : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
    }`}>
      {/* Header */}
      <div className={`p-3 border-b flex items-center gap-2 ${
        isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'
      }`}>
        <Command className="w-4 h-4 text-[var(--accent-primary)]" />
        <span className={`text-sm font-medium ${isDark ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
          Comandos
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick Access - Default Commands */}
        <div className={`border-b ${isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'}`}>
          <button
            onClick={() => setQuickExpanded(!quickExpanded)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
              isDark
                ? 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Acceso Rápido</span>
            <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${quickExpanded ? '' : '-rotate-90'}`} />
          </button>

          <AnimatePresence>
            {quickExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <div className="px-2 pb-2 space-y-2">
                  {Object.entries(CATEGORIES).map(([categoryKey, categoryInfo]) => {
                    const categoryCommands = DEFAULT_COMMANDS.filter(cmd => cmd.category === categoryKey);
                    if (categoryCommands.length === 0) return null;

                    const CategoryIcon = categoryInfo.icon;
                    return (
                      <div key={categoryKey}>
                        <div className={`flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wider ${categoryInfo.color}`}>
                          <CategoryIcon className="w-3 h-3" />
                          <span>{categoryInfo.label}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          {categoryCommands.map((cmd) => (
                            <button
                              key={cmd.id}
                              onClick={() => executeCommand(cmd.command)}
                              disabled={!canSendCommand}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed group ${
                                isDark
                                  ? 'hover:bg-[var(--bg-hover)]'
                                  : 'hover:bg-[var(--bg-hover)]'
                              }`}
                              title={cmd.command}
                            >
                              <Play className={`w-3 h-3 shrink-0 ${
                                isDark
                                  ? 'text-[var(--text-tertiary)] group-hover:text-[var(--success)]'
                                  : 'text-[var(--text-tertiary)] group-hover:text-[var(--success)]'
                              }`} />
                              <span className={`text-xs truncate ${
                                isDark
                                  ? 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                                  : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                              }`}>{cmd.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Saved Commands */}
        <div className="p-2 space-y-2">
          {commands.length > 0 && (
            <>
              <div className={`px-2 py-1 text-xs font-medium uppercase tracking-wider ${
                isDark ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-tertiary)]'
              }`}>
                Guardados
              </div>

              {Object.entries(CATEGORIES).map(([categoryKey, categoryInfo]) => {
                const categoryCommands = commands.filter(cmd => (cmd.category || 'other') === categoryKey);
                if (categoryCommands.length === 0) return null;

                const CategoryIcon = categoryInfo.icon;
                return (
                  <div key={categoryKey}>
                    <div className={`flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wider ${categoryInfo.color}`}>
                      <CategoryIcon className="w-3 h-3" />
                      <span>{categoryInfo.label}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      {categoryCommands.map((cmd) => (
                        <div
                          key={cmd.id}
                          className={`group flex items-center justify-between px-2 py-1.5 rounded transition-colors ${
                            isDark ? 'hover:bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Play className={`w-3 h-3 shrink-0 ${
                              isDark
                                ? 'text-[var(--text-tertiary)] group-hover:text-[var(--success)]'
                                : 'text-[var(--text-tertiary)] group-hover:text-[var(--success)]'
                            }`} />
                            <button
                              onClick={() => executeCommand(cmd.command)}
                              disabled={!canSendCommand}
                              className="text-left min-w-0 flex-1 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={cmd.command}
                            >
                              <span className={`text-xs block truncate ${
                                isDark
                                  ? 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                                  : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                              }`}>{cmd.name}</span>
                            </button>
                          </div>
                          <button
                            onClick={() => deleteCommand(cmd.id)}
                            className={`p-1 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-all ${
                              isDark
                                ? 'hover:bg-[var(--error)]/20 text-[var(--text-tertiary)] hover:text-[var(--error)]'
                                : 'hover:bg-[var(--error)]/10 text-[var(--text-tertiary)] hover:text-[var(--error)]'
                            }`}
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {commands.length === 0 && (
            <div className={`text-center py-4 ${isDark ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-tertiary)]'}`}>
              <Code className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
              <p className="text-xs">No hay comandos guardados</p>
            </div>
          )}
        </div>

        {/* Add Command Button */}
        <div className={`p-2 border-t ${isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'}`}>
          <button
            onClick={() => openCommandModal()}
            className={`w-full flex items-center justify-center gap-2 p-2 rounded border border-dashed transition-colors ${
              isDark
                ? 'border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--accent-primary)]/10'
                : 'border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Añadir Comando</span>
          </button>
        </div>
      </div>
    </div>
  );
}
