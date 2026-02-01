import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
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

// Floating Tooltip Component for collapsed sidebar
function SessionTooltip({
  session,
  hasActiveTab,
  onConnect,
  onEdit,
  onDelete,
}: {
  session: Session;
  hasActiveTab: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = getColor(session.color);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.15 }}
      className="absolute left-full top-0 ml-2 z-50 min-w-[200px] max-w-[280px]"
    >
      <div className={`p-3 rounded-lg border shadow-xl ${colors.bg} ${colors.border} bg-[var(--bg-elevated)]`}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors.bg} ${colors.border}`}>
            <Server className={`w-4 h-4 ${colors.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-[var(--text-primary)] truncate">{session.name}</div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {session.username}@{session.host}:{session.port}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1 text-xs">
          {session.authMethod && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-tertiary)]">Auth:</span>
              <span className="text-[var(--text-secondary)]">
                {session.authMethod === 'key' ? 'Clave SSH' : 'Contraseña'}
              </span>
            </div>
          )}
          {session.jumpHost && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-tertiary)]">Jump:</span>
              <span className="text-[var(--text-secondary)]">{session.jumpHost}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-[var(--border-primary)]">
          {/* Connect button - always visible */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConnect();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md transition-colors bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium"
          >
            <Play className="w-3 h-3" />
            {hasActiveTab ? 'Nueva sesión' : 'Conectar'}
          </button>
          {/* Edit/Delete only when no active tab */}
          {!hasActiveTab && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                title="Editar"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 rounded-md transition-colors hover:bg-[var(--error-bg)] text-[var(--text-secondary)] hover:text-[var(--error)]"
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Sortable Session Item Component
function SortableSessionItem({
  session,
  isActive,
  hasActiveTab,
  sidebarCollapsed,
  onSelect,
  onConnect,
  onEdit,
  onDelete,
}: {
  session: Session;
  isActive: boolean;
  hasActiveTab: boolean;
  sidebarCollapsed: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colors = getColor(session.color);
  const [isHovered, setIsHovered] = useState(false);
  const { isDark } = useTheme();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `session-${session.id}`,
    data: { type: 'session', session, groupId: session.groupId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
      className={`
        relative p-1 rounded-md cursor-pointer transition-all group
        ${isDragging ? 'opacity-0' : ''}
        ${isActive
          ? 'bg-[var(--bg-hover)]'
          : 'hover:bg-[var(--bg-tertiary)]'
        }
      `}
    >
      <div className="flex items-center gap-1.5">
        {/* Drag handle */}
        {!sidebarCollapsed && (
          <div
            {...listeners}
            {...attributes}
            className={`cursor-grab active:cursor-grabbing transition-opacity touch-none ${
              isDark ? 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}

        {/* Server icon with session color */}
        <div className={`w-6 h-6 rounded flex items-center justify-center border ${colors.bg} ${colors.border} shrink-0`}>
          <Server className={`w-3 h-3 ${colors.text}`} />
        </div>

        {/* Session info */}
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs truncate text-[var(--text-primary)]">{session.name}</div>
            <div className="text-[10px] truncate text-[var(--text-tertiary)]">
              {session.username}@{session.host}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isHovered && !sidebarCollapsed && (
          <div className="flex items-center">
            {/* Play button - always visible to allow multiple sessions */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
              className="p-1 rounded transition-colors hover:bg-[var(--accent-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
              title={hasActiveTab ? "Abrir nueva sesión" : "Conectar"}
            >
              <Play className="w-3 h-3" />
            </button>
            {/* Edit/Delete only when no active tab (protect session data) */}
            {!hasActiveTab && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1 rounded transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                title="Editar"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
            {!hasActiveTab && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded transition-colors hover:bg-[var(--error-bg)] text-[var(--text-secondary)] hover:text-[var(--error)]"
                title="Eliminar"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Jump host indicator */}
      {session.jumpHost && !sidebarCollapsed && (
        <div className="mt-0.5 ml-[34px] text-[9px] text-[var(--text-tertiary)]">
          via {session.jumpHost}
        </div>
      )}

      {/* Floating tooltip for collapsed sidebar */}
      <AnimatePresence>
        {sidebarCollapsed && isHovered && !isDragging && (
          <SessionTooltip
            session={session}
            hasActiveTab={hasActiveTab}
            onConnect={onConnect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Session preview for drag overlay
function SessionDragPreview({ session }: { session: Session }) {
  const colors = getColor(session.color);

  return (
    <div className="p-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--accent-primary)] shadow-lg opacity-90">
      <div className="flex items-center gap-1.5">
        <GripVertical className="w-3 h-3 text-[var(--text-tertiary)]" />
        <div className={`w-6 h-6 rounded flex items-center justify-center border ${colors.bg} ${colors.border} shrink-0`}>
          <Server className={`w-3 h-3 ${colors.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-xs truncate text-[var(--text-primary)]">{session.name}</div>
          <div className="text-[10px] truncate text-[var(--text-tertiary)]">
            {session.username}@{session.host}
          </div>
        </div>
      </div>
    </div>
  );
}

// Group preview for drag overlay
function GroupDragPreview({ group, sessionCount }: { group: SessionGroup; sessionCount: number }) {
  const colors = getColor(group.color);

  return (
    <div className="p-1.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--accent-primary)] shadow-lg opacity-90">
      <div className="flex items-center gap-1.5">
        <GripVertical className="w-3 h-3 text-[var(--text-tertiary)]" />
        <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
        <Folder className={`w-3.5 h-3.5 ${colors.text}`} />
        <span className="text-xs font-medium text-[var(--text-secondary)]">{group.name}</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">({sessionCount})</span>
      </div>
    </div>
  );
}

// Ungrouped Drop Zone Component - separate component so useDroppable registers properly
function UngroupedDropZone({
  isVisible,
  isDraggingGroupedSession,
}: {
  isVisible: boolean;
  isDraggingGroupedSession: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'ungrouped-drop',
    data: { type: 'ungrouped' },
  });

  if (!isVisible) {
    // Still render but hidden to keep the droppable registered
    return <div ref={setNodeRef} style={{ height: 0, overflow: 'hidden' }} />;
  }

  return (
    <div
      ref={setNodeRef}
      className={`mt-2 py-3 px-2 rounded-md border-2 border-dashed transition-colors duration-150 ${
        isOver
          ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]/50 text-[var(--accent-primary)]'
          : isDraggingGroupedSession
            ? 'border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)]'
            : 'border-[var(--border-secondary)] bg-transparent text-[var(--text-tertiary)]'
      }`}
      style={{ minHeight: '44px' }}
    >
      <p className="text-xs text-center font-medium">
        {isOver
          ? '✓ Soltar para quitar del grupo'
          : isDraggingGroupedSession
            ? '↓ Arrastrar aquí para quitar del grupo'
            : 'Sin grupo'}
      </p>
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

// Sortable Group Component
function SortableGroup({
  group,
  sessions,
  tabs,
  activeSessionId,
  sidebarCollapsed,
  isOver,
  onSelectSession,
  onConnectSession,
  onEditSession,
  onDeleteSession,
  onToggleExpand,
  onEditGroup,
  onDeleteGroup,
  onChangeGroupColor,
}: {
  group: SessionGroup;
  sessions: Session[];
  tabs: { sessionId: string }[];
  activeSessionId: string | null;
  sidebarCollapsed: boolean;
  isOver: boolean;
  onSelectSession: (id: string) => void;
  onConnectSession: (session: Session) => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (session: Session) => void;
  onToggleExpand: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onChangeGroupColor: (color: SessionColor) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const colors = getColor(group.color);
  const groupSessions = sessions.filter((s) => s.groupId === group.id);
  const sessionIds = useMemo(() => groupSessions.map(s => `session-${s.id}`), [groupSessions]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group-${group.id}`,
    data: { type: 'group', group },
  });

  const { setNodeRef: setDroppableRef, isOver: isOverDroppable } = useDroppable({
    id: `group-drop-${group.id}`,
    data: { type: 'group-drop', groupId: group.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Collapsed view
  if (sidebarCollapsed) {
    return (
      <div ref={setNodeRef} style={style} className="mb-2">
        <div
          onClick={onToggleExpand}
          className={`p-2 rounded-lg cursor-pointer flex flex-col items-center gap-1 transition-all ${
            isOver || isOverDroppable ? 'bg-[var(--accent-subtle)]/50' : 'hover:bg-[var(--bg-tertiary)]'
          }`}
          title={group.name}
        >
          <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
          <Folder className={`w-4 h-4 ${colors.text}`} />
        </div>
        {group.isExpanded && groupSessions.map((session) => (
          <SortableSessionItem
            key={session.id}
            session={session}
            isActive={activeSessionId === session.id}
            hasActiveTab={tabs.some(t => t.sessionId === session.id)}
            sidebarCollapsed={true}
            onSelect={() => onSelectSession(session.id)}
            onConnect={() => onConnectSession(session)}
            onEdit={() => onEditSession(session)}
            onDelete={() => onDeleteSession(session)}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-0.5 rounded-md transition-all ${isOver || isOverDroppable ? 'bg-[var(--accent-subtle)]/50' : ''}`}
    >
      {/* Group Header */}
      <div
        className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-md cursor-pointer hover:bg-[var(--bg-tertiary)] group"
      >
        {/* Drag handle for group */}
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing touch-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3 h-3" />
        </div>
        <div onClick={onToggleExpand} className="flex items-center gap-1.5 flex-1 min-w-0">
          <ChevronDown
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${group.isExpanded ? '' : '-rotate-90'}`}
          />

          <ColorPicker selectedColor={group.color} onSelect={onChangeGroupColor} />

          <div className={colors.text}>
            {group.isExpanded ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
          </div>
          <span className="flex-1 text-xs font-medium text-[var(--text-secondary)] truncate">{group.name}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{groupSessions.length}</span>
        </div>

        {/* Group Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
          >
            <MoreVertical className="w-3 h-3" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-md shadow-xl py-0.5 min-w-[100px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditGroup();
                    setShowMenu(false);
                  }}
                  className="w-full px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5"
                >
                  <Edit2 className="w-3 h-3" />
                  Renombrar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGroup();
                    setShowMenu(false);
                  }}
                  className="w-full px-2 py-1 text-left text-xs text-[var(--error)] hover:bg-[var(--error-bg)] flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" />
                  Eliminar
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
            <div ref={setDroppableRef} className={`ml-2.5 mt-0.5 space-y-0 border-l-2 pl-1.5 ${colors.border}`}>
              <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
                {groupSessions.map((session) => (
                  <SortableSessionItem
                    key={session.id}
                    session={session}
                    isActive={activeSessionId === session.id}
                    hasActiveTab={tabs.some(t => t.sessionId === session.id)}
                    sidebarCollapsed={false}
                    onSelect={() => onSelectSession(session.id)}
                    onConnect={() => onConnectSession(session)}
                    onEdit={() => onEditSession(session)}
                    onDelete={() => onDeleteSession(session)}
                  />
                ))}
              </SortableContext>
              {groupSessions.length === 0 && (
                <div className={`text-[10px] py-1.5 px-1.5 text-center rounded border border-dashed ${
                  isOver || isOverDroppable ? 'border-[var(--accent-primary)]/50 text-[var(--accent-primary)]' : 'border-[var(--border-secondary)] text-[var(--text-tertiary)]'
                }`}>
                  {isOver || isOverDroppable ? 'Soltar aquí' : 'Vacío'}
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
    tabs,
    activeSessionId,
    setActiveSession,
    deleteSession,
    sidebarCollapsed,
    toggleSidebar,
    openSessionModal,
    createTab,
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroupExpanded,
    updateSession,
    reorderSessions,
    reorderGroups,
  } = useStore();
  const { isDark } = useTheme();

  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

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

  // Sortable IDs for groups
  const sortedGroups = useMemo(() =>
    [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [groups]
  );
  const groupIds = useMemo(() => sortedGroups.map(g => `group-${g.id}`), [sortedGroups]);

  // Sortable IDs for ungrouped sessions
  const ungroupedSessionIds = useMemo(() =>
    ungroupedSessions.map(s => `session-${s.id}`),
    [ungroupedSessions]
  );

  // Note: UngroupedDropZone component handles its own useDroppable

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? (over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle group reordering
    if (activeData?.type === 'group' && overData?.type === 'group') {
      const activeGroupId = active.id.toString().replace('group-', '');
      const overGroupId = over.id.toString().replace('group-', '');

      if (activeGroupId !== overGroupId) {
        const oldIndex = groups.findIndex(g => g.id === activeGroupId);
        const newIndex = groups.findIndex(g => g.id === overGroupId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newGroupIds = arrayMove(groups, oldIndex, newIndex).map(g => g.id);
          reorderGroups(newGroupIds);
        }
      }
      return;
    }

    // Handle session reordering/moving
    if (activeData?.type === 'session') {
      const sessionId = activeData.session.id;
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;

      const overId = over.id.toString();

      // Check if dropping on "ungrouped" zone first (highest priority for removing from group)
      if (overData?.type === 'ungrouped' || overId === 'ungrouped' || overId === 'ungrouped-drop') {
        // Move to ungrouped (remove from any group)
        if (session.groupId) {
          await updateSession(sessionId, { groupId: null }, false);
        }
        return;
      }

      // Check if dropping on another session (reordering within same group)
      if (overData?.type === 'session') {
        const overSession = overData.session;

        // Same group - reorder
        if (session.groupId === overSession.groupId) {
          const groupSessions = sessions.filter(s =>
            session.groupId ? s.groupId === session.groupId : !s.groupId
          );
          const oldIndex = groupSessions.findIndex(s => s.id === sessionId);
          const newIndex = groupSessions.findIndex(s => s.id === overSession.id);

          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newSessionIds = arrayMove(groupSessions, oldIndex, newIndex).map(s => s.id);
            reorderSessions(session.groupId || null, newSessionIds);
          }
        } else {
          // Different group - move session to the new group
          await updateSession(sessionId, { groupId: overSession.groupId || null }, false);
        }
        return;
      }

      // Determine target group from other drop targets
      let targetGroupId: string | null | undefined = undefined;

      if (overData?.type === 'group') {
        targetGroupId = overData.group?.id || null;
      } else if (overData?.type === 'group-drop') {
        targetGroupId = overData.groupId || null;
      } else if (over.id.toString().startsWith('group-drop-')) {
        targetGroupId = over.id.toString().replace('group-drop-', '');
      } else if (over.id.toString().startsWith('group-')) {
        targetGroupId = over.id.toString().replace('group-', '');
      }

      // Only update if we have a valid target and group changed
      if (targetGroupId !== undefined && session.groupId !== targetGroupId) {
        await updateSession(sessionId, { groupId: targetGroupId }, false);
      }
    }
  }, [sessions, groups, updateSession, reorderSessions, reorderGroups]);

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

  // Get the session or group being dragged for the overlay
  const activeSession = activeId
    ? sessions.find(s => `session-${s.id}` === activeId)
    : null;

  const activeGroup = activeId
    ? sortedGroups.find(g => `group-${g.id}` === activeId)
    : null;

  // Custom collision detection that prioritizes "ungrouped" zone
  const customCollisionDetection = useCallback((args: Parameters<typeof closestCenter>[0]) => {
    const { droppableRects, droppableContainers, pointerCoordinates } = args;

    // If we have pointer coordinates, check if pointer is inside ungrouped zone
    if (pointerCoordinates) {
      const ungroupedContainer = droppableContainers.find(c => c.id === 'ungrouped-drop');
      if (ungroupedContainer) {
        const rect = droppableRects.get('ungrouped-drop');
        if (rect) {
          const isInside =
            pointerCoordinates.x >= rect.left &&
            pointerCoordinates.x <= rect.right &&
            pointerCoordinates.y >= rect.top &&
            pointerCoordinates.y <= rect.bottom;

          if (isInside) {
            return [{
              id: 'ungrouped-drop',
              data: { droppableContainer: ungroupedContainer },
            }];
          }
        }
      }
    }

    // Also try pointerWithin as backup
    const pointerCollisions = pointerWithin(args);
    const ungroupedPointer = pointerCollisions.find(c => c.id === 'ungrouped-drop');
    if (ungroupedPointer) {
      return [ungroupedPointer];
    }

    // Fall back to closest center for other elements
    return closestCenter(args);
  }, []);

  // Force re-measuring during drag to detect dynamically sized elements
  const measuringConfig = useMemo(() => ({
    droppable: {
      strategy: MeasuringStrategy.Always,
    },
  }), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      measuring={measuringConfig}
    >
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 64 : 280 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className={`h-full border-r flex flex-col ${
          isDark
            ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
            : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
        }`}
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
                {searchQuery ? `Resultados (${filteredSessions.length})` : 'Sesiones'}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => openSessionModal({ mode: 'create' })}
                  className="p-1 rounded transition-colors text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-hover)]"
                  title="Nueva sesión"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsAddingGroup(true)}
                  className="p-1 rounded transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  title="Nuevo grupo"
                >
                  <Folder className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Add Group Input */}
          {isAddingGroup && !sidebarCollapsed && (
            <div className="mb-2 px-0.5">
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
          <div className="space-y-0.5">
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              {sortedGroups.map((group) => (
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
                    <SortableGroup
                      group={group}
                      sessions={filteredSessions}
                      tabs={tabs}
                      activeSessionId={activeSessionId}
                      sidebarCollapsed={sidebarCollapsed}
                      isOver={overId === `group-${group.id}` || overId === `group-drop-${group.id}`}
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
                    />
                  )}
                </div>
              ))}
            </SortableContext>

            {/* Ungrouped Sessions */}
            {ungroupedSessions.length > 0 && (
              <>
                {sortedGroups.length > 0 && !sidebarCollapsed && (
                  <div className="px-2 py-1.5 text-[10px] font-medium text-[var(--text-tertiary)]">Sin Grupo</div>
                )}
                <SortableContext items={ungroupedSessionIds} strategy={verticalListSortingStrategy}>
                  {ungroupedSessions.map((session) => (
                    <SortableSessionItem
                      key={session.id}
                      session={session}
                      isActive={activeSessionId === session.id}
                      hasActiveTab={tabs.some(t => t.sessionId === session.id)}
                      sidebarCollapsed={sidebarCollapsed}
                      onSelect={() => setActiveSession(session.id)}
                      onConnect={() => handleConnect(session)}
                      onEdit={() => handleEdit(session)}
                      onDelete={() => handleDelete(session)}
                    />
                  ))}
                </SortableContext>
              </>
            )}

            {/* Drop zone for removing from group */}
            <UngroupedDropZone
              isVisible={!sidebarCollapsed && sortedGroups.length > 0}
              isDraggingGroupedSession={!!(activeId && activeSession?.groupId)}
            />

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
              <div className="text-center py-6 text-[var(--text-tertiary)]">
                <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm mb-2">Sin sesiones SSH</p>
                <button
                  onClick={() => openSessionModal({ mode: 'create' })}
                  className="text-[var(--accent-primary)] hover:text-[var(--accent-hover)] text-xs font-medium"
                >
                  Crear tu primera sesión
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer - solo botón + cuando colapsado */}
        {sidebarCollapsed && (
          <div className="p-2 border-t flex items-center justify-center border-[var(--border-primary)]">
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className="p-2 rounded-lg transition-colors text-[var(--accent-primary)] hover:bg-[var(--bg-hover)]"
              title="Nueva Sesión"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </motion.aside>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeSession ? (
          <SessionDragPreview session={activeSession} />
        ) : activeGroup ? (
          <GroupDragPreview group={activeGroup} sessionCount={filteredSessions.filter(s => s.groupId === activeGroup.id).length} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
