import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Plus,
  Upload,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  Play,
  Folder,
  FolderPlus,
  MoreVertical,
  Settings,
  Search,
  Download,
  Network,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { AnchoredMenu } from './AnchoredMenu';
import { NoteBadge } from './NoteBadge';
import { ConfirmDialog } from './ConfirmDialog';
import type { Session, SessionGroup, SessionColor } from '../types';
import { parseSessionsFile, resolveImportGroupPath } from '../utils/sessionImport';
import { ICON_NAMES, DEFAULT_SESSION_ICON } from '../utils/icons';
import { DynamicIcon, GroupIconView } from '../utils/IconView';
import { colorConfig, COLOR_NAMES as allColors, getColor } from '../utils/colors';

const SESSION_DRAG_MIME = 'application/x-ori-session-id';

type DeleteTarget =
  | { type: 'session'; session: Session; jumpRefCount: number }
  | { type: 'group'; group: SessionGroup }
  | null;

// Session Item Component
function SessionItem({
  session,
  isActive,
  sidebarCollapsed,
  onSelect,
  onConnect,
  onEdit,
  onInfo,
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
  onInfo: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, sessionId: string) => void;
  onDragEnd: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const colors = getColor(session.color);
  const tooltip = `${session.username}@${session.host}${
    session.jumpHops?.length
      ? ` (vía ${session.jumpHops.map((hop) => hop.host).join(' → ')})`
      : ''
  }${session.notes ? `\n\n${session.notes}` : ''}`;

  if (sidebarCollapsed) {
    // Smaller box than before (5x5) so collapsed sessions don't look oversized;
    // uses the session's chosen icon, or a default monitor.
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, session.id)}
        onDragEnd={onDragEnd}
        onClick={onSelect}
        onDoubleClick={onConnect}
        title={`${session.name} — ${tooltip}`}
        className={`fila px-1 my-0.5 cursor-pointer flex items-center justify-center transition-all duration-100 ${
          isActive ? 'bg-superficie-fuerte hover:bg-superficie-fuerte' : 'hover:scale-105 active:scale-95'
        }`}
      >
        <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${colors.bg} ${colors.border}`}>
          <DynamicIcon name={session.icon || DEFAULT_SESSION_ICON} className={`w-3 h-3 ${colors.text}`} />
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, session.id)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onConnect}
      title={tooltip}
      className={`fila group relative flex items-center gap-2 cursor-pointer transition-colors duration-100 ${
        isActive ? 'bg-superficie-fuerte hover:bg-superficie-fuerte' : ''
      }`}
    >
      {/* The small colored dot the user likes, unless a custom icon is set */}
      {session.icon ? (
        <DynamicIcon name={session.icon} className={`w-3.5 h-3.5 shrink-0 ${colors.text}`} />
      ) : (
        <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
      )}
      <span className="flex-1 min-w-0 truncate text-[13px] text-texto">{session.name}</span>

      {session.notes ? <NoteBadge notes={session.notes} /> : null}

      {/* Actions: connect on hover, rest behind dots menu */}
      <div
        className={`flex items-center gap-0.5 transition-opacity ${
          menuAnchor ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onConnect();
          }}
          className="btn-icono hover:text-acento cursor-pointer"
          title="Conectar"
        >
          <Play className="w-3 h-3" />
        </button>
        <button
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect());
          }}
          className="btn-icono cursor-pointer"
          title="Más acciones"
        >
          <MoreVertical className="w-3 h-3" />
        </button>
      </div>

      {menuAnchor && (
        <AnchoredMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onInfo();
              setMenuAnchor(null);
            }}
            className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2"
          >
            <Network className="w-3.5 h-3.5" />
            Información
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              setMenuAnchor(null);
            }}
            className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Editar
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setMenuAnchor(null);
            }}
            className="fila w-full text-left text-sm text-peligro flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
        </AnchoredMenu>
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
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className={`w-4 h-4 rounded-full ${colorConfig[selectedColor].dot} hover:ring-2 hover:ring-borde-fuerte transition-all`}
        title="Cambiar color"
      />

      {menuAnchor && (
        <AnchoredMenu
          anchor={menuAnchor}
          align="left"
          className="p-2"
          onClose={() => setMenuAnchor(null)}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {allColors.map((color) => (
              <button
                key={color}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(color);
                  setMenuAnchor(null);
                }}
                className={`w-5 h-5 rounded-full ${colorConfig[color].dot} hover:scale-110 transition-transform ${
                  selectedColor === color ? 'ring-2 ring-texto ring-offset-1 ring-offset-modal' : ''
                }`}
                title={color}
              />
            ))}
          </div>
        </AnchoredMenu>
      )}
    </div>
  );
}

// Icon Picker Component (for folders): same anchored-menu pattern as ColorPicker
function IconPicker({
  selectedIcon,
  color,
  onSelect,
}: {
  selectedIcon: string;
  color: SessionColor;
  onSelect: (icon: string) => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const colors = getColor(color);

  return (
    <div className="relative">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className={`btn-icono p-0.5 ${colors.text}`}
        title="Cambiar icono"
      >
        <GroupIconView name={selectedIcon} isExpanded className="w-4 h-4" />
      </button>

      {menuAnchor && (
        <AnchoredMenu anchor={menuAnchor} align="left" className="p-2" onClose={() => setMenuAnchor(null)}>
          <div className="grid grid-cols-6 gap-1 w-[200px]">
            {ICON_NAMES.map((name) => (
              <button
                key={name}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(name);
                  setMenuAnchor(null);
                }}
                className={`btn-icono w-7 h-7 flex items-center justify-center ${
                  selectedIcon === name ? 'bg-superficie-fuerte hover:bg-superficie-fuerte ring-1 ring-acento' : ''
                }`}
                title={name}
              >
                <DynamicIcon name={name} className="w-4 h-4 text-texto-suave" />
              </button>
            ))}
          </div>
        </AnchoredMenu>
      )}
    </div>
  );
}

// Shared handlers/state threaded through the (recursive) group tree, so nested
// folders behave exactly like top-level ones without prop explosion.
interface TreeHandlers {
  groups: SessionGroup[];
  sessions: Session[];
  activeSessionId: string | null;
  sidebarCollapsed: boolean;
  dragOverGroupId: string | null;
  editingGroupId: string | null;
  editGroupName: string;
  setEditGroupName: (name: string) => void;
  onSubmitRename: (groupId: string) => void;
  onCancelRename: () => void;
  onSelectSession: (id: string) => void;
  onConnectSession: (session: Session) => void;
  onEditSession: (session: Session) => void;
  onInfoSession: (session: Session) => void;
  onDeleteSession: (session: Session) => void;
  onToggleExpand: (groupId: string) => void;
  onStartRename: (group: SessionGroup) => void;
  onEditGroupFull: (group: SessionGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  onChangeGroupColor: (groupId: string, color: SessionColor) => void;
  onChangeGroupIcon: (groupId: string, icon: string) => void;
  onAddSubgroup: (parentId: string) => void;
  onMoveGroup: (id: string, direction: 'up' | 'down') => void;
  onDragStart: (e: React.DragEvent, sessionId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, groupId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, groupId: string) => void;
}

// Group Component with Drop Zone (renders its child folders recursively)
function GroupSection({ group, h }: { group: SessionGroup; h: TreeHandlers }) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const colors = getColor(group.color);
  const groupSessions = h.sessions.filter((s) => s.groupId === group.id);
  const childGroups = h.groups
    .filter((g) => (g.parentId ?? null) === group.id)
    .sort((a, b) => a.order - b.order);
  const isDragOver = h.dragOverGroupId === group.id;

  // Position among siblings (same parentId) to enable/disable up/down moves.
  const siblings = h.groups
    .filter((g) => (g.parentId ?? null) === (group.parentId ?? null))
    .sort((a, b) => a.order - b.order);
  const siblingIndex = siblings.findIndex((g) => g.id === group.id);
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblings.length - 1;

  // Collapsed view: icon box (group color) + nested content when expanded
  if (h.sidebarCollapsed) {
    return (
      <div className="mb-2">
        <div
          onClick={() => h.onToggleExpand(group.id)}
          onDragOver={(e) => h.onDragOver(e, group.id)}
          onDragLeave={h.onDragLeave}
          onDrop={(e) => h.onDrop(e, group.id)}
          className={`fila px-1 my-0.5 cursor-pointer flex items-center justify-center border border-dashed transition-all duration-100 ${
            isDragOver
              ? 'bg-[rgba(255,79,163,0.08)] border-acento'
              : 'border-transparent hover:scale-105 active:scale-95'
          }`}
          title={`${group.name} (${groupSessions.length})${group.notes ? `\n\n${group.notes}` : ''}`}
        >
          <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${colors.bg} ${colors.border} ${colors.text}`}>
            <GroupIconView name={group.icon} isExpanded={group.isExpanded} className="w-4 h-4" />
          </div>
        </div>
        {group.isExpanded && childGroups.map((child) => (
          <GroupSection key={child.id} group={child} h={h} />
        ))}
        {group.isExpanded && groupSessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={h.activeSessionId === session.id}
            sidebarCollapsed={true}
            onSelect={() => h.onSelectSession(session.id)}
            onConnect={() => h.onConnectSession(session)}
            onEdit={() => h.onEditSession(session)}
            onInfo={() => h.onInfoSession(session)}
            onDelete={() => h.onDeleteSession(session)}
            onDragStart={h.onDragStart}
            onDragEnd={h.onDragEnd}
          />
        ))}
      </div>
    );
  }

  // Inline rename takes over the header row (works at any depth)
  if (h.editingGroupId === group.id) {
    return (
      <div className="fila flex items-center gap-2 bg-superficie-fuerte mb-1 border border-borde">
        <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
        <input
          type="text"
          value={h.editGroupName}
          onChange={(e) => h.setEditGroupName(e.target.value)}
          className="campo flex-1 min-w-0"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') h.onSubmitRename(group.id);
            if (e.key === 'Escape') h.onCancelRename();
          }}
          onBlur={() => h.onSubmitRename(group.id)}
        />
      </div>
    );
  }

  return (
    <div
      className={`mb-1 rounded-xl border border-dashed transition-all ${isDragOver ? 'bg-[rgba(255,79,163,0.08)] border-acento' : 'border-transparent'}`}
      onDragOver={(e) => h.onDragOver(e, group.id)}
      onDragLeave={h.onDragLeave}
      onDrop={(e) => h.onDrop(e, group.id)}
    >
      {/* Group Header */}
      <div
        onClick={() => h.onToggleExpand(group.id)}
        className="fila flex items-center gap-2 cursor-pointer group"
      >
        <ChevronDown
          className={`w-4 h-4 text-texto-tenue transition-transform duration-200 ${group.isExpanded ? '' : '-rotate-90'}`}
        />

        <ColorPicker selectedColor={group.color} onSelect={(color) => h.onChangeGroupColor(group.id, color)} />

        <IconPicker
          selectedIcon={group.icon}
          color={group.color}
          onSelect={(icon) => h.onChangeGroupIcon(group.id, icon)}
        />

        <span className="flex-1 text-sm font-medium text-texto truncate">{group.name}</span>
        {group.notes ? <NoteBadge notes={group.notes} /> : null}
        <span className="text-xs text-texto-tenue tabular-nums">{groupSessions.length}</span>

        {/* Group Menu */}
        <div className={`relative shrink-0 ${menuAnchor ? '' : 'hidden group-hover:block group-focus-within:block'}`}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect());
            }}
            className="btn-icono cursor-pointer"
            title="Acciones de carpeta"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuAnchor && (
            <AnchoredMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onEditGroupFull(group);
                  setMenuAnchor(null);
                }}
                className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2"
              >
                <Settings className="w-3.5 h-3.5" />
                Editar carpeta…
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onStartRename(group);
                  setMenuAnchor(null);
                }}
                className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Renombrar
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onAddSubgroup(group.id);
                  setMenuAnchor(null);
                }}
                className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Añadir subcarpeta
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onMoveGroup(group.id, 'up');
                  setMenuAnchor(null);
                }}
                disabled={!canMoveUp}
                className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Subir
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onMoveGroup(group.id, 'down');
                  setMenuAnchor(null);
                }}
                disabled={!canMoveDown}
                className="fila w-full text-left text-sm text-texto-suave flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Bajar
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onDeleteGroup(group.id);
                  setMenuAnchor(null);
                }}
                className="fila w-full text-left text-sm text-peligro flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </AnchoredMenu>
          )}
        </div>
      </div>

      {/* Child folders + sessions */}
      <AnimatePresence initial={false}>
        {group.isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-3 mt-0.5 space-y-px border-l border-borde pl-2">
              {childGroups.map((child) => (
                <GroupSection key={child.id} group={child} h={h} />
              ))}
              {groupSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={h.activeSessionId === session.id}
                  sidebarCollapsed={false}
                  onSelect={() => h.onSelectSession(session.id)}
                  onConnect={() => h.onConnectSession(session)}
                  onEdit={() => h.onEditSession(session)}
                  onInfo={() => h.onInfoSession(session)}
                  onDelete={() => h.onDeleteSession(session)}
                  onDragStart={h.onDragStart}
                  onDragEnd={h.onDragEnd}
                />
              ))}
              {childGroups.length === 0 && groupSessions.length === 0 && (
                <div className={`text-xs py-3 px-2 text-center rounded-xl border-2 border-dashed ${
                  isDragOver ? 'border-acento bg-[rgba(255,79,163,0.08)] text-acento' : 'border-borde text-texto-tenue'
                }`}>
                  {isDragOver ? '↓ Suelta la sesión aquí' : 'Arrastra sesiones aquí'}
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
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
    openSessionModal,
    openGroupModal,
    openInfoModal,
    openSettingsModal,
    createTab,
    addSession,
    addToast,
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroupExpanded,
    moveGroup,
    updateSession,
  } = useStore(
    useShallow((s) => ({
      sessions: s.sessions,
      groups: s.groups,
      activeSessionId: s.activeSessionId,
      setActiveSession: s.setActiveSession,
      deleteSession: s.deleteSession,
      sidebarCollapsed: s.sidebarCollapsed,
      sidebarWidth: s.sidebarWidth,
      setSidebarWidth: s.setSidebarWidth,
      toggleSidebar: s.toggleSidebar,
      openSessionModal: s.openSessionModal,
      openGroupModal: s.openGroupModal,
      openInfoModal: s.openInfoModal,
      openSettingsModal: s.openSettingsModal,
      createTab: s.createTab,
      addSession: s.addSession,
      addToast: s.addToast,
      addGroup: s.addGroup,
      updateGroup: s.updateGroup,
      deleteGroup: s.deleteGroup,
      toggleGroupExpanded: s.toggleGroupExpanded,
      moveGroup: s.moveGroup,
      updateSession: s.updateSession,
    }))
  );

  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportingSessions, setIsImportingSessions] = useState(false);
  const [showExportWarn, setShowExportWarn] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Drag the right edge to resize the sidebar; width is clamped + persisted
  // in the store. Listeners live on window so the drag keeps working even if
  // the pointer leaves the thin handle.
  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: PointerEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      setSidebarWidth(e.clientX - left);
    };
    const stop = () => setIsResizing(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, setSidebarWidth]);

  // Filter sessions based on search query
  const filterSessions = useCallback((sessionList: Session[], query: string): Session[] => {
    if (!query.trim()) return sessionList;
    const lowerQuery = query.toLowerCase();
    return sessionList.filter(session =>
      session.name.toLowerCase().includes(lowerQuery) ||
      session.host.toLowerCase().includes(lowerQuery) ||
      session.username.toLowerCase().includes(lowerQuery) ||
      (session.notes?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }, []);

  // Filtered sessions
  const filteredSessions = filterSessions(sessions, searchQuery);

  // Sessions without a group (from filtered results)
  const ungroupedSessions = filteredSessions.filter((s) => !s.groupId);

  // Top-level folders only; subfolders are rendered recursively inside them
  const topLevelGroups = groups
    .filter((g) => !g.parentId)
    .sort((a, b) => a.order - b.order);

  const getDraggedSessionId = useCallback((e: React.DragEvent) => (
    e.dataTransfer.getData(SESSION_DRAG_MIME) ||
    e.dataTransfer.getData('text/plain') ||
    draggingSessionId ||
    ''
  ), [draggingSessionId]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, sessionId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData(SESSION_DRAG_MIME, sessionId);
    e.dataTransfer.setData('text/plain', sessionId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingSessionId(sessionId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const nextTarget = e.relatedTarget;
    if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
      return;
    }

    setDragOverGroupId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const sessionId = getDraggedSessionId(e);

    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.groupId !== groupId) {
        await updateSession(sessionId, { groupId }, false);
      }
    }

    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [getDraggedSessionId, sessions, updateSession]);

  const handleDropToUngrouped = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const sessionId = getDraggedSessionId(e);

    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.groupId) {
        await updateSession(sessionId, { groupId: null }, false);
      }
    }

    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [getDraggedSessionId, sessions, updateSession]);

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

  const handleInfo = useCallback((session: Session) => {
    openInfoModal({ session });
  }, [openInfoModal]);

  const handleDelete = useCallback(async (session: Session) => {
    let jumpRefCount = 0;
    try {
      jumpRefCount = await invoke<number>('count_session_jump_refs', { id: session.id });
    } catch (error) {
      console.error('Failed to count session jump references:', error);
    }
    setDeleteTarget({ type: 'session', session, jumpRefCount });
  }, []);

  // Folder creation goes through the modal so a note/color/icon can be set
  const handleAddSubgroup = useCallback((parentId: string) => {
    openGroupModal({ mode: 'create', parentId });
  }, [openGroupModal]);

  const handleEditGroupSubmit = useCallback((groupId: string) => {
    if (editGroupName.trim()) {
      updateGroup(groupId, { name: editGroupName.trim() });
    }
    setEditingGroup(null);
    setEditGroupName('');
  }, [editGroupName, updateGroup]);

  const handleCancelRename = useCallback(() => {
    setEditingGroup(null);
    setEditGroupName('');
  }, []);

  const handleDeleteGroup = useCallback((groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (group) {
      setDeleteTarget({ type: 'group', group });
    }
  }, [groups]);

  const handleCancelDelete = useCallback(() => {
    if (!isDeleting) {
      setDeleteTarget(null);
    }
  }, [isDeleting]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'session') {
        await deleteSession(deleteTarget.session.id);
      } else {
        await deleteGroup(deleteTarget.group.id);
      }
      setDeleteTarget(null);
    } catch {
      // Store actions already show the specific error toast.
    } finally {
      setIsDeleting(false);
    }
  }, [deleteGroup, deleteSession, deleteTarget]);

  const handleImportSessions = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImportingSessions(true);

    try {
      const content = await file.text();
      const result = parseSessionsFile(file.name, content);
      if (result.sessions.length === 0) {
        addToast({
          type: 'error',
          title: 'Error al importar',
          message: result.errors[0] ?? 'No se encontraron sesiones válidas',
        });
        return;
      }

      const groupByName = new Map(
        groups.map((group) => [`name:${group.name.trim().toLowerCase()}`, group.id])
      );
      let importedCount = 0;
      let failedCount = 0;

      const getOrCreateGroupId = (groupName?: string) => {
        const normalizedName = groupName?.trim();
        if (!normalizedName) return undefined;

        const isPath = normalizedName.includes('/');
        let parentId: string | null = null;
        let path = '';
        for (const group of resolveImportGroupPath(normalizedName, groups)) {
          const nameKey = group.name.toLowerCase();
          path = path ? `${path}/${nameKey}` : nameKey;
          const groupKey = `${isPath ? 'path' : 'name'}:${path}`;
          const existingGroupId = groupByName.get(groupKey) ?? group.id;
          if (existingGroupId) {
            parentId = existingGroupId;
          } else {
            const createdGroupId = addGroup({
              name: group.name,
              color: 'blue',
              icon: 'folder',
              isExpanded: true,
              parentId,
            });
            groupByName.set(`name:${nameKey}`, createdGroupId);
            if (parentId === null) {
              groupByName.set(`path:${path}`, createdGroupId);
            }
            parentId = createdGroupId;
          }
          groupByName.set(groupKey, parentId);
        }
        return parentId ?? undefined;
      };

      for (const importedSession of result.sessions) {
        const { groupName, ...sessionData } = importedSession;
        const groupId = getOrCreateGroupId(groupName);

        try {
          await addSession({ ...sessionData, groupId }, false);
          importedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      const warningCount = result.errors.length + failedCount;
      addToast({
        type: warningCount > 0 ? 'warning' : 'success',
        title: 'Importación completada',
        message: warningCount > 0
          ? `${importedCount} sesiones importadas, ${warningCount} omitidas`
          : `${importedCount} sesiones importadas`,
        duration: 5000,
      });
    } catch (error) {
      console.error('Session import failed:', error);
      addToast({
        type: 'error',
        title: 'Error al importar',
        message: 'No se pudo leer el archivo seleccionado',
      });
    } finally {
      setIsImportingSessions(false);
    }
  }, [addGroup, addSession, addToast, groups]);

  // Export to a JSON file. Credentials are decrypted and written by the backend
  // directly (never cross IPC); the user is warned first because the file holds
  // plaintext secrets.
  const handleExport = useCallback(async () => {
    setShowExportWarn(false);
    setIsExporting(true);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      // Start the native save panel in Downloads with the name prefilled; the
      // user can still navigate and save anywhere they want.
      let defaultPath = 'sesiones-ssh.json';
      try {
        const { downloadDir, join } = await import('@tauri-apps/api/path');
        defaultPath = await join(await downloadDir(), 'sesiones-ssh.json');
      } catch {
        // No access to the download dir: fall back to a bare filename
      }
      const path = await save({
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return; // user cancelled the dialog
      const count = await invoke<number>('export_sessions_to_path', { path });
      addToast({
        type: 'success',
        title: 'Exportado',
        message: `${count} ${count === 1 ? 'sesión exportada' : 'sesiones exportadas'}`,
        duration: 4000,
      });
    } catch (error) {
      console.error('Export failed:', error);
      addToast({
        type: 'error',
        title: 'Error al exportar',
        message: 'No se pudieron exportar las sesiones',
      });
    } finally {
      setIsExporting(false);
    }
  }, [addToast]);

  let deleteDescription = '';
  if (deleteTarget) {
    const isGroup = deleteTarget.type === 'group';
    const name = isGroup ? deleteTarget.group.name : deleteTarget.session.name;
    deleteDescription = isGroup
      ? `¿Eliminar "${name}"? Las sesiones de esta carpeta pasarán a Sin carpeta.`
      : `¿Eliminar "${name}"? Se borra la sesión SSH guardada.`;

    if (deleteTarget.type === 'session' && deleteTarget.jumpRefCount > 0) {
      deleteDescription += ` ${deleteTarget.jumpRefCount} sesión(es) la usan como máquina de salto`
        + ' y dejarán de conectar hasta que cambies su salto.';
    }
  }

  const treeHandlers: TreeHandlers = {
    groups,
    sessions: filteredSessions,
    activeSessionId,
    sidebarCollapsed,
    dragOverGroupId,
    editingGroupId: editingGroup,
    editGroupName,
    setEditGroupName,
    onSubmitRename: handleEditGroupSubmit,
    onCancelRename: handleCancelRename,
    onSelectSession: setActiveSession,
    onConnectSession: handleConnect,
    onEditSession: handleEdit,
    onInfoSession: handleInfo,
    onDeleteSession: handleDelete,
    onToggleExpand: toggleGroupExpanded,
    onStartRename: (group) => {
      setEditingGroup(group.id);
      setEditGroupName(group.name);
    },
    onEditGroupFull: (group) => openGroupModal({ group, mode: 'edit' }),
    onDeleteGroup: handleDeleteGroup,
    onChangeGroupColor: (id, color) => updateGroup(id, { color }),
    onChangeGroupIcon: (id, icon) => updateGroup(id, { icon }),
    onAddSubgroup: handleAddSubgroup,
    onMoveGroup: moveGroup,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return (
    <>
    <motion.aside
      ref={asideRef}
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : sidebarWidth }}
      // No animation while dragging, so the edge tracks the pointer 1:1
      transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
      className="relative h-full shrink-0 bg-panel backdrop-blur-2xl border-r border-borde flex flex-col"
      onDragEnd={handleDragEnd}
    >
      {/* Resize handle on the right edge (only when expanded) */}
      {!sidebarCollapsed && (
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          onDoubleClick={() => setSidebarWidth(280)}
          className={`absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize transition-colors ${
            isResizing ? 'bg-acento' : 'hover:bg-acento'
          }`}
          title="Arrastra para redimensionar (doble clic para restablecer)"
        />
      )}
      {/* Header */}
      <div
        className={`p-3 flex border-b border-borde ${
          sidebarCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'
        }`}
      >
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-6 h-6 rounded" />
          {!sidebarCollapsed && <span className="font-semibold text-texto">Sesiones</span>}
        </div>

        <button
          onClick={toggleSidebar}
          className="btn-icono"
          title={sidebarCollapsed ? 'Expandir' : 'Contraer'}
        >
          <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
        {/* Search bar */}
        {!sidebarCollapsed && (
          <div className="mb-3 px-1">
            <div className="relative">
              <Search className="absolute left-2.5 inset-y-0 my-auto w-4 h-4 text-texto-tenue" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar sesiones..."
                className="campo pl-8 pr-10 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="btn-icono absolute right-1 inset-y-0 my-auto h-fit"
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
          <div className="mb-3 px-1 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-texto-tenue">
              {searchQuery ? `Resultados (${filteredSessions.length})` : 'Todas las sesiones'}
            </span>
            <div className="flex items-center gap-1">
              <input
                ref={importInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={handleImportSessions}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={isImportingSessions}
                className="btn-icono hover:text-exito disabled:opacity-50 disabled:cursor-not-allowed"
                title="Importar sesiones"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowExportWarn(true)}
                disabled={isExporting || sessions.length === 0}
                className="btn-icono hover:text-exito disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar sesiones"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => openGroupModal({ mode: 'create', parentId: null })}
                className="btn-icono"
                title="Añadir carpeta"
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="btn-icono hover:text-acento"
                title="Añadir sesión"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Collapsed: just show add button */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-2 mb-3">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="hidden"
              onChange={handleImportSessions}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={isImportingSessions}
              className="btn-icono hover:text-exito disabled:opacity-50 disabled:cursor-not-allowed"
              title="Importar sesiones"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowExportWarn(true)}
              disabled={isExporting || sessions.length === 0}
              className="btn-icono hover:text-exito disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar sesiones"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className="btn-icono hover:text-acento"
              title="Añadir sesión"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Groups (nested folders rendered recursively) */}
        <div className="space-y-1">
          {topLevelGroups.map((group) => (
            <GroupSection key={group.id} group={group} h={treeHandlers} />
          ))}

          {/* Sesiones sin carpeta */}
          {ungroupedSessions.length > 0 && (
            <>
              {groups.length > 0 && !sidebarCollapsed && (
                <div className="px-2.5 py-2 text-[11px] uppercase tracking-wider text-texto-tenue">Sin carpeta</div>
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
                  onInfo={() => handleInfo(session)}
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
              className={`mt-3 p-3 rounded-xl border-2 border-dashed transition-all ${
                dragOverGroupId === 'ungrouped'
                  ? 'border-acento bg-[rgba(255,79,163,0.08)] text-acento'
                  : 'border-borde text-texto-tenue'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setDragOverGroupId('ungrouped');
              }}
              onDragLeave={handleDragLeave}
              onDrop={handleDropToUngrouped}
            >
              <p className="text-xs text-center">↓ Quitar de la carpeta</p>
            </div>
          )}

          {/* No search results */}
          {filteredSessions.length === 0 && searchQuery && !sidebarCollapsed && (
            <div className="text-center py-6 text-texto-tenue">
              <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-2">Ninguna sesión coincide con "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-acento hover:text-texto text-xs font-medium"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}

          {/* Empty state */}
          {sessions.length === 0 && !sidebarCollapsed && (
            <div className="text-center py-8 text-texto-tenue">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-3">Aún no hay sesiones</p>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="text-acento hover:text-texto text-sm font-medium"
              >
                Añade tu primera sesión
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings button at bottom */}
      <div className="p-3 border-t border-borde">
        <button
          onClick={() => openSettingsModal()}
          className="fila w-full flex items-center gap-3 transition-colors text-texto-suave hover:text-texto"
          title="Configuración"
        >
          <Settings className="w-5 h-5" />
          {!sidebarCollapsed && (
            <span className="text-sm font-medium">Configuración</span>
          )}
        </button>
      </div>
    </motion.aside>
    <ConfirmDialog
      open={!!deleteTarget}
      title={deleteTarget?.type === 'group' ? 'Eliminar carpeta' : 'Eliminar sesión'}
      description={deleteDescription}
      busy={isDeleting}
      busyLabel="Eliminando..."
      onCancel={handleCancelDelete}
      onConfirm={handleConfirmDelete}
    />
    <ConfirmDialog
      open={showExportWarn}
      danger={false}
      title="Exportar sesiones"
      description="El archivo JSON incluirá las contraseñas y frases de contraseña en TEXTO PLANO. Guárdalo en un lugar seguro. ¿Continuar?"
      confirmLabel="Exportar"
      onConfirm={handleExport}
      onCancel={() => setShowExportWarn(false)}
    />
    </>
  );
}
