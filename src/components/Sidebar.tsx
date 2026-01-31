import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Plus,
  ChevronLeft,
  ChevronDown,
  Trash2,
  Edit2,
  Play,
  Folder,
  FolderOpen,
  MoreVertical,
  GripVertical,
  Settings,
  Search,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { Session, SessionGroup, SessionColor } from '../types';

// Color configuration
const colorConfig: Record<SessionColor, { bg: string; border: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-400' },
  green: { bg: 'bg-[var(--success)]/20', border: 'border-[var(--success)]/40', text: 'text-[var(--success)]', dot: 'bg-[var(--success)]' },
  purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-400' },
  orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-400' },
  red: { bg: 'bg-[var(--error)]/20', border: 'border-[var(--error)]/40', text: 'text-[var(--error)]', dot: 'bg-[var(--error)]' },
  cyan: { bg: 'bg-[var(--accent-primary)]/20', border: 'border-[var(--accent-primary)]/40', text: 'text-[var(--accent-primary)]', dot: 'bg-[var(--accent-primary)]' },
  pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400', dot: 'bg-pink-400' },
  yellow: { bg: 'bg-[var(--warning)]/20', border: 'border-[var(--warning)]/40', text: 'text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
};

const allColors: SessionColor[] = ['blue', 'green', 'purple', 'orange', 'red', 'cyan', 'pink', 'yellow'];

const getColor = (color: SessionColor) => colorConfig[color] || colorConfig.blue;

// Session Item Component
function SessionItem({
  session,
  isActive,
  sidebarCollapsed,
  onSelect,
  onConnect,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  session: Session;
  isActive: boolean;
  sidebarCollapsed: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, sessionId: string) => void;
  onDragEnd: () => void;
}) {
  const colors = getColor(session.color);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { isDark } = useTheme();

  return (
    <div
      draggable={!sidebarCollapsed}
      onDragStart={(e) => {
        setIsDragging(true);
        onDragStart(e, session.id);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
      className={`
        relative p-1.5 rounded-lg cursor-pointer transition-all group
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${isActive
          ? isDark ? 'bg-[var(--bg-hover)]' : 'bg-[var(--bg-hover)]'
          : isDark ? 'hover:bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'
        }
      `}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        {!sidebarCollapsed && (
          <div className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing ${
            isDark ? 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}>
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Server icon with session color */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors.bg} ${colors.border} shrink-0`}>
          <Server className={`w-4 h-4 ${colors.text}`} />
        </div>

        {/* Session info */}
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate text-[var(--text-primary)]">{session.name}</div>
            <div className="text-xs truncate text-[var(--text-tertiary)]">
              {session.username}@{session.host}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isHovered && !sidebarCollapsed && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
              className={`p-1.5 rounded-md transition-colors ${
                isDark
                  ? 'hover:bg-[var(--accent-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
                  : 'hover:bg-[var(--accent-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
              }`}
              title="Conectar"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className={`p-1.5 rounded-md transition-colors ${
                isDark
                  ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Editar"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={`p-1.5 rounded-md transition-colors ${
                isDark
                  ? 'hover:bg-[var(--error-bg)] text-[var(--text-secondary)] hover:text-[var(--error)]'
                  : 'hover:bg-[var(--error-bg)] text-[var(--text-secondary)] hover:text-[var(--error)]'
              }`}
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Jump host indicator */}
      {session.jumpHost && !sidebarCollapsed && (
        <div className="mt-1 ml-[52px] text-[10px] text-[var(--text-tertiary)]">
          via {session.jumpHost}
        </div>
      )}
    </div>
  );
}

// Color Picker Component
function ColorPicker({
  selectedColor,
  onSelect,
}: {
  selectedColor: SessionColor;
  onSelect: (color: SessionColor) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-4 h-4 rounded-full ${colorConfig[selectedColor].dot} hover:ring-2 hover:ring-white/30 transition-all`}
        title="Cambiar color"
      />

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-6 z-50 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg shadow-xl p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {allColors.map((color) => (
                <button
                  key={color}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(color);
                    setIsOpen(false);
                  }}
                  className={`w-5 h-5 rounded-full ${colorConfig[color].dot} hover:scale-110 transition-transform ${
                    selectedColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-[var(--bg-elevated)]' : ''
                  }`}
                  title={color}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Group Component with Drop Zone
function GroupSection({
  group,
  sessions,
  activeSessionId,
  sidebarCollapsed,
  dragOverGroupId,
  onSelectSession,
  onConnectSession,
  onEditSession,
  onDeleteSession,
  onToggleExpand,
  onEditGroup,
  onDeleteGroup,
  onChangeGroupColor,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  group: SessionGroup;
  sessions: Session[];
  activeSessionId: string | null;
  sidebarCollapsed: boolean;
  dragOverGroupId: string | null;
  onSelectSession: (id: string) => void;
  onConnectSession: (session: Session) => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (session: Session) => void;
  onToggleExpand: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onChangeGroupColor: (color: SessionColor) => void;
  onDragStart: (e: React.DragEvent, sessionId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, groupId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, groupId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const colors = getColor(group.color);
  const groupSessions = sessions.filter((s) => s.groupId === group.id);
  const isDragOver = dragOverGroupId === group.id;

  // Collapsed view
  if (sidebarCollapsed) {
    return (
      <div className="mb-2">
        <div
          onClick={onToggleExpand}
          onDragOver={(e) => onDragOver(e, group.id)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, group.id)}
          className={`p-2 rounded-lg cursor-pointer flex flex-col items-center gap-1 transition-all ${
            isDragOver ? 'bg-[var(--accent-subtle)] ring-2 ring-[var(--accent-primary)]' : 'hover:bg-[var(--bg-tertiary)]'
          }`}
          title={group.name}
        >
          <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
          <Folder className={`w-4 h-4 ${colors.text}`} />
        </div>
        {group.isExpanded && groupSessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={activeSessionId === session.id}
            sidebarCollapsed={true}
            onSelect={() => onSelectSession(session.id)}
            onConnect={() => onConnectSession(session)}
            onEdit={() => onEditSession(session)}
            onDelete={() => onDeleteSession(session)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`mb-1 rounded-lg transition-all ${isDragOver ? 'bg-[var(--accent-subtle)] ring-2 ring-[var(--accent-primary)]/50' : ''}`}
      onDragOver={(e) => onDragOver(e, group.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, group.id)}
    >
      {/* Group Header */}
      <div
        onClick={onToggleExpand}
        className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)] group"
      >
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform duration-200 ${group.isExpanded ? '' : '-rotate-90'}`}
        />

        <ColorPicker selectedColor={group.color} onSelect={onChangeGroupColor} />

        <div className={colors.text}>
          {group.isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </div>
        <span className="flex-1 text-sm font-medium text-[var(--text-secondary)] truncate">{group.name}</span>
        <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{groupSessions.length}</span>

        {/* Group Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg shadow-xl py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditGroup();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGroup();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-[var(--error)] hover:bg-[var(--error-bg)] flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Group Sessions */}
      <AnimatePresence initial={false}>
        {group.isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className={`ml-3 mt-0.5 space-y-0.5 border-l-2 pl-2 ${colors.border}`}>
              {groupSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={activeSessionId === session.id}
                  sidebarCollapsed={false}
                  onSelect={() => onSelectSession(session.id)}
                  onConnect={() => onConnectSession(session)}
                  onEdit={() => onEditSession(session)}
                  onDelete={() => onDeleteSession(session)}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
              {groupSessions.length === 0 && (
                <div className={`text-xs py-3 px-2 text-center rounded-lg border-2 border-dashed ${
                  isDragOver ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'border-[var(--border-secondary)] text-[var(--text-tertiary)]'
                }`}>
                  {isDragOver ? '↓ Soltar sesión aquí' : 'Arrastra sesiones aquí'}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main Sidebar Component
export function Sidebar() {
  const {
    sessions,
    groups,
    activeSessionId,
    setActiveSession,
    deleteSession,
    sidebarCollapsed,
    toggleSidebar,
    openSessionModal,
    openSettingsModal,
    createTab,
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroupExpanded,
    updateSession,
  } = useStore();
  const { isDark } = useTheme();

  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sessions based on search query
  const filterSessions = useCallback((sessionList: Session[], query: string): Session[] => {
    if (!query.trim()) return sessionList;
    const lowerQuery = query.toLowerCase();
    return sessionList.filter(session =>
      session.name.toLowerCase().includes(lowerQuery) ||
      session.host.toLowerCase().includes(lowerQuery) ||
      session.username.toLowerCase().includes(lowerQuery)
    );
  }, []);

  // Filtered sessions
  const filteredSessions = filterSessions(sessions, searchQuery);

  // Sessions without a group (from filtered results)
  const ungroupedSessions = filteredSessions.filter((s) => !s.groupId);

  // Drag handlers - using simpler approach
  const handleDragStart = useCallback((e: React.DragEvent, sessionId: string) => {
    // Importante: setData debe llamarse durante dragstart
    e.dataTransfer.setData('text/plain', sessionId);
    e.dataTransfer.dropEffect = 'move';
    e.dataTransfer.effectAllowed = 'move';
    setDraggingSessionId(sessionId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverGroupId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, groupId: string) => {
    e.preventDefault();

    // Obtener sessionId del dataTransfer o del estado
    let sessionId = e.dataTransfer.getData('text/plain');
    if (!sessionId) sessionId = draggingSessionId || '';

    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.groupId !== groupId) {
        await updateSession(sessionId, { groupId }, false);
      }
    }

    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [sessions, updateSession, draggingSessionId]);

  const handleDropToUngrouped = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();

    let sessionId = e.dataTransfer.getData('text/plain');
    if (!sessionId) sessionId = draggingSessionId || '';

    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.groupId) {
        await updateSession(sessionId, { groupId: null }, false);
      }
    }

    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [sessions, updateSession, draggingSessionId]);

  const handleDragEnd = useCallback(() => {
    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, []);

  const handleConnect = useCallback((session: Session) => {
    createTab(session.id);
  }, [createTab]);

  const handleEdit = useCallback((session: Session) => {
    openSessionModal({ session, mode: 'edit' });
  }, [openSessionModal]);

  const handleDelete = useCallback(async (session: Session) => {
    if (confirm(`¿Eliminar la sesión "${session.name}"?`)) {
      await deleteSession(session.id);
    }
  }, [deleteSession]);

  const handleAddGroup = useCallback(() => {
    if (newGroupName.trim()) {
      addGroup({
        name: newGroupName.trim(),
        color: 'blue',
        isExpanded: true,
      });
      setNewGroupName('');
      setIsAddingGroup(false);
    }
  }, [newGroupName, addGroup]);

  const handleEditGroupSubmit = useCallback((groupId: string) => {
    if (editGroupName.trim()) {
      updateGroup(groupId, { name: editGroupName.trim() });
    }
    setEditingGroup(null);
    setEditGroupName('');
  }, [editGroupName, updateGroup]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    if (confirm('¿Eliminar este grupo? Las sesiones se moverán a Sin Grupo.')) {
      deleteGroup(groupId);
    }
  }, [deleteGroup]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={`h-full border-r flex flex-col ${
        isDark
          ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
          : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
      }`}
      onDragEnd={handleDragEnd}
    >
      {/* Header */}
      <div className={`p-2 flex items-center justify-between border-b ${
        isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'
      }`}>
        {!sidebarCollapsed && (
          <span className="font-medium text-[var(--text-primary)]">Sesiones</span>
        )}

        <button
          onClick={toggleSidebar}
          className={`p-2 rounded-lg transition-colors ${
            sidebarCollapsed ? 'mx-auto' : ''
          } ${
            isDark
              ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
        >
          <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-1.5 scrollbar-hide">
        {/* Search bar */}
        {!sidebarCollapsed && (
          <div className="mb-2 px-0.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar sesiones..."
                className={`w-full pl-8 pr-8 py-1.5 border rounded-lg text-sm outline-none focus:border-[var(--accent-primary)]/50 focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-all ${
                  isDark
                    ? 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                    : 'bg-[var(--bg-input)] border-[var(--border-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors ${
                    isDark
                      ? 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  title="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Actions bar */}
        {!sidebarCollapsed && (
          <div className="mb-2 px-0.5 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              {searchQuery ? `Resultados (${filteredSessions.length})` : 'Todas las Sesiones'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsAddingGroup(true)}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark
                    ? 'hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
                title="Añadir Grupo"
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark
                    ? 'hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-primary)]'
                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-primary)]'
                }`}
                title="Añadir Sesión"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Collapsed: just show add button */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-2 mb-3">
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className={`p-2 rounded-lg transition-colors ${
                isDark
                  ? 'hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-primary)]'
                  : 'hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-primary)]'
              }`}
              title="Añadir Sesión"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Add Group Input */}
        {isAddingGroup && !sidebarCollapsed && (
          <div className="mb-3 px-1">
            <div className={`flex items-center gap-2 rounded-lg p-2 border ${
              isDark
                ? 'bg-[var(--bg-tertiary)] border-[var(--border-primary)]'
                : 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
            }`}>
              <Folder className="w-4 h-4 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nombre del grupo..."
                className={`flex-1 bg-transparent text-sm outline-none ${
                  isDark
                    ? 'text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                    : 'text-[var(--text-primary)] placeholder-[var(--text-tertiary)]'
                }`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddGroup();
                  if (e.key === 'Escape') {
                    setIsAddingGroup(false);
                    setNewGroupName('');
                  }
                }}
                onBlur={() => {
                  if (!newGroupName.trim()) {
                    setIsAddingGroup(false);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-1">
          {groups.map((group) => (
            <div key={group.id}>
              {editingGroup === group.id && !sidebarCollapsed ? (
                <div className={`flex items-center gap-2 rounded-lg p-2 mb-2 border ${
                  isDark
                    ? 'bg-[var(--bg-tertiary)] border-[var(--border-primary)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-primary)]'
                }`}>
                  <div className={`w-3 h-3 rounded-full ${getColor(group.color).dot}`} />
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    className={`flex-1 bg-transparent text-sm outline-none ${
                      isDark ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                    }`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditGroupSubmit(group.id);
                      if (e.key === 'Escape') {
                        setEditingGroup(null);
                        setEditGroupName('');
                      }
                    }}
                    onBlur={() => handleEditGroupSubmit(group.id)}
                  />
                </div>
              ) : (
                <GroupSection
                  group={group}
                  sessions={filteredSessions}
                  activeSessionId={activeSessionId}
                  sidebarCollapsed={sidebarCollapsed}
                  dragOverGroupId={dragOverGroupId}
                  onSelectSession={setActiveSession}
                  onConnectSession={handleConnect}
                  onEditSession={handleEdit}
                  onDeleteSession={handleDelete}
                  onToggleExpand={() => toggleGroupExpanded(group.id)}
                  onEditGroup={() => {
                    setEditingGroup(group.id);
                    setEditGroupName(group.name);
                  }}
                  onDeleteGroup={() => handleDeleteGroup(group.id)}
                  onChangeGroupColor={(color) => updateGroup(group.id, { color })}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                />
              )}
            </div>
          ))}

          {/* Ungrouped Sessions */}
          {ungroupedSessions.length > 0 && (
            <>
              {groups.length > 0 && !sidebarCollapsed && (
                <div className="px-2 py-2 text-xs font-medium text-[var(--text-tertiary)]">Sin Grupo</div>
              )}
              {ungroupedSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={activeSessionId === session.id}
                  sidebarCollapsed={sidebarCollapsed}
                  onSelect={() => setActiveSession(session.id)}
                  onConnect={() => handleConnect(session)}
                  onEdit={() => handleEdit(session)}
                  onDelete={() => handleDelete(session)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </>
          )}

          {/* Drop zone for removing from group */}
          {!sidebarCollapsed && groups.length > 0 && draggingSessionId && (
            <div
              className={`mt-3 p-3 rounded-lg border-2 border-dashed transition-all ${
                dragOverGroupId === 'ungrouped'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                  : 'border-[var(--border-primary)] text-[var(--text-tertiary)]'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverGroupId('ungrouped');
              }}
              onDragLeave={() => setDragOverGroupId(null)}
              onDrop={handleDropToUngrouped}
            >
              <p className="text-xs text-center">↓ Quitar del grupo</p>
            </div>
          )}

          {/* No search results */}
          {filteredSessions.length === 0 && searchQuery && !sidebarCollapsed && (
            <div className="text-center py-6 text-[var(--text-tertiary)]">
              <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-2">No hay sesiones que coincidan con "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-[var(--accent-primary)] hover:text-[var(--accent-hover)] text-xs font-medium"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}

          {/* Empty state */}
          {sessions.length === 0 && !sidebarCollapsed && (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-3">Aún no hay sesiones</p>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="text-[var(--accent-primary)] hover:text-[var(--accent-hover)] text-sm font-medium"
              >
                Añadir tu primera sesión
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings button at bottom */}
      <div className={`p-2 border-t ${isDark ? 'border-[var(--border-primary)]' : 'border-[var(--border-primary)]'}`}>
        <button
          onClick={() => openSettingsModal()}
          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
            isDark
              ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Configuración"
        >
          <Settings className="w-5 h-5" />
          {!sidebarCollapsed && (
            <span className="text-sm font-medium">Configuración</span>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
