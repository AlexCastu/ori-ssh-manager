import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Monitor,
  Plus,
  Upload,
  ChevronLeft,
  ChevronDown,
  Trash2,
  Edit2,
  Play,
  Folder,
  FolderOpen,
  MoreVertical,
  Settings,
  Search,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { AnchoredMenu } from './AnchoredMenu';
import type { Session, SessionGroup, SessionColor } from '../types';
import { parseSessionsFile } from '../utils/sessionImport';

// Color configuration
const colorConfig: Record<SessionColor, { bg: string; border: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-400' },
  green: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-600 dark:text-green-400', dot: 'bg-green-400' },
  purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-400' },
  orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-400' },
  red: { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-400' },
  cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-400' },
  pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-600 dark:text-pink-400', dot: 'bg-pink-400' },
  yellow: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-400' },
};

const allColors: SessionColor[] = ['blue', 'green', 'purple', 'orange', 'red', 'cyan', 'pink', 'yellow'];
const SESSION_DRAG_MIME = 'application/x-ori-session-id';

const getColor = (color: SessionColor) => colorConfig[color] || colorConfig.blue;

type DeleteTarget =
  | { type: 'session'; session: Session }
  | { type: 'group'; group: SessionGroup }
  | null;

function DeleteConfirmationDialog({
  target,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  target: DeleteTarget;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!target) return null;

  const isGroup = target.type === 'group';
  const name = isGroup ? target.group.name : target.session.name;
  const description = isGroup
    ? `Delete "${name}"? Sessions in this group will be moved to Ungrouped.`
    : `Delete "${name}"? This removes the saved SSH session.`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-label="Cancel delete"
        disabled={isDeleting}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="relative w-full max-w-sm rounded-lg border border-zinc-300 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="delete-confirm-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {isGroup ? 'Delete group' : 'Delete session'}
            </h2>
            <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const colors = getColor(session.color);
  const tooltip = `${session.username}@${session.host}${
    session.jumpHops?.length
      ? ` (via ${session.jumpHops.map((hop) => hop.host).join(' → ')})`
      : ''
  }`;

  if (sidebarCollapsed) {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, session.id)}
        onDragEnd={onDragEnd}
        onClick={onSelect}
        onDoubleClick={onConnect}
        title={`${session.name} — ${tooltip}`}
        className={`my-0.5 p-1 rounded-md cursor-pointer flex items-center justify-center transition-all duration-100 ${
          isActive ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 hover:scale-105 active:scale-95'
        }`}
      >
        <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${colors.bg} ${colors.border}`}>
          <Monitor className={`w-4 h-4 ${colors.text}`} />
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
      className={`group relative flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors duration-100 ${
        isActive ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70'
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
      <span className="flex-1 min-w-0 truncate text-[13px] text-zinc-800 dark:text-zinc-200">{session.name}</span>

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
          className="p-1 rounded hover:bg-blue-500/20 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          title="Connect"
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
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          title="More actions"
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
              onEdit();
              setMenuAnchor(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setMenuAnchor(null);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
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
        className={`w-4 h-4 rounded-full ${colorConfig[selectedColor].dot} hover:ring-2 hover:ring-zinc-900/30 dark:hover:ring-white/30 transition-all`}
        title="Change color"
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
                  selectedColor === color ? 'ring-2 ring-zinc-900 dark:ring-white ring-offset-1 ring-offset-white dark:ring-offset-zinc-800' : ''
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
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, groupId: string) => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
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
          className={`p-1 my-0.5 rounded-md cursor-pointer flex items-center justify-center transition-all duration-100 ${
            isDragOver
              ? 'bg-blue-500/20 ring-2 ring-blue-500'
              : 'hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 hover:scale-105 active:scale-95'
          }`}
          title={`${group.name} (${groupSessions.length})`}
        >
          {/* Group initials in the group color: readable at a glance when collapsed */}
          <div className={`w-7 h-7 rounded-md border flex items-center justify-center text-[10px] font-bold uppercase ${colors.bg} ${colors.border} ${colors.text}`}>
            {group.name.slice(0, 2)}
          </div>
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
      className={`mb-1 rounded-lg transition-all ${isDragOver ? 'bg-blue-500/10 ring-2 ring-blue-500/50' : ''}`}
      onDragOver={(e) => onDragOver(e, group.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, group.id)}
    >
      {/* Group Header */}
      <div
        onClick={onToggleExpand}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 group"
      >
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${group.isExpanded ? '' : '-rotate-90'}`}
        />

        <ColorPicker selectedColor={group.color} onSelect={onChangeGroupColor} />

        <div className={colors.text}>
          {group.isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </div>
        <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{group.name}</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">{groupSessions.length}</span>

        {/* Group Menu */}
        <div className="relative">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(menuAnchor ? null : e.currentTarget.getBoundingClientRect());
            }}
            className="p-1 rounded opacity-70 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
            title="Group actions"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuAnchor && (
            <AnchoredMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditGroup();
                  setMenuAnchor(null);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Rename
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteGroup();
                  setMenuAnchor(null);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </AnchoredMenu>
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
            <div className={`ml-3 mt-0.5 space-y-px border-l pl-2 ${colors.border}`}>
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
                  isDragOver ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border-zinc-300 dark:border-zinc-700/50 text-zinc-400 dark:text-zinc-600'
                }`}>
                  {isDragOver ? '↓ Drop session here' : 'Drag sessions here'}
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
    addSession,
    addToast,
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroupExpanded,
    updateSession,
  } = useStore(
    useShallow((s) => ({
      sessions: s.sessions,
      groups: s.groups,
      activeSessionId: s.activeSessionId,
      setActiveSession: s.setActiveSession,
      deleteSession: s.deleteSession,
      sidebarCollapsed: s.sidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
      openSessionModal: s.openSessionModal,
      openSettingsModal: s.openSettingsModal,
      createTab: s.createTab,
      addSession: s.addSession,
      addToast: s.addToast,
      addGroup: s.addGroup,
      updateGroup: s.updateGroup,
      deleteGroup: s.deleteGroup,
      toggleGroupExpanded: s.toggleGroupExpanded,
      updateSession: s.updateSession,
    }))
  );

  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportingSessions, setIsImportingSessions] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const handleDelete = useCallback((session: Session) => {
    setDeleteTarget({ type: 'session', session });
  }, []);

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
          title: 'Import failed',
          message: result.errors[0] ?? 'No valid sessions found',
        });
        return;
      }

      const groupByName = new Map(
        groups.map((group) => [group.name.trim().toLowerCase(), group.id])
      );
      let importedCount = 0;
      let failedCount = 0;

      const getOrCreateGroupId = (groupName?: string) => {
        const normalizedName = groupName?.trim();
        if (!normalizedName) return undefined;

        const groupKey = normalizedName.toLowerCase();
        const existingGroupId = groupByName.get(groupKey);
        if (existingGroupId) return existingGroupId;

        const createdGroupId = addGroup({
          name: normalizedName,
          color: 'blue',
          isExpanded: true,
        });
        groupByName.set(groupKey, createdGroupId);
        return createdGroupId;
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
        title: 'Import completed',
        message: warningCount > 0
          ? `${importedCount} sessions imported, ${warningCount} skipped`
          : `${importedCount} sessions imported`,
        duration: 5000,
      });
    } catch (error) {
      console.error('Session import failed:', error);
      addToast({
        type: 'error',
        title: 'Import failed',
        message: 'Could not read the selected file',
      });
    } finally {
      setIsImportingSessions(false);
    }
  }, [addGroup, addSession, addToast, groups]);

  return (
    <>
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-full shrink-0 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-800/50 flex flex-col"
      onDragEnd={handleDragEnd}
    >
      {/* Header */}
      <div
        className={`p-3 flex border-b border-zinc-200 dark:border-zinc-800/50 ${
          sidebarCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'
        }`}
      >
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-6 h-6 rounded" />
          {!sidebarCollapsed && <span className="font-medium text-zinc-800 dark:text-zinc-200">Sessions</span>}
        </div>

        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          title={sidebarCollapsed ? 'Expand' : 'Collapse'}
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-full pl-8 pr-8 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  title="Clear search"
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
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {searchQuery ? `Results (${filteredSessions.length})` : 'All Sessions'}
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
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Import Sessions"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsAddingGroup(true)}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                title="Add Group"
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Add Session"
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
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Import Sessions"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="Add Session"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Add Group Input */}
        {isAddingGroup && !sidebarCollapsed && (
          <div className="mb-3 px-1">
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2 border border-zinc-300 dark:border-zinc-700">
              <Folder className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name..."
                className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none"
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
                <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2 mb-2 border border-zinc-300 dark:border-zinc-700">
                  <div className={`w-3 h-3 rounded-full ${getColor(group.color).dot}`} />
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white outline-none"
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
                <div className="px-2 py-2 text-xs text-zinc-400 dark:text-zinc-600 font-medium">Ungrouped</div>
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
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
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
              <p className="text-xs text-center">↓ Remove from group</p>
            </div>
          )}

          {/* No search results */}
          {filteredSessions.length === 0 && searchQuery && !sidebarCollapsed && (
            <div className="text-center py-6 text-zinc-500">
              <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-2">No sessions match "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Empty state */}
          {sessions.length === 0 && !sidebarCollapsed && (
            <div className="text-center py-8 text-zinc-500">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-3">No sessions yet</p>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
              >
                Add your first session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings button at bottom */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/50">
        <button
          onClick={() => openSettingsModal()}
          className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          title="Configuración"
        >
          <Settings className="w-5 h-5" />
          {!sidebarCollapsed && (
            <span className="text-sm font-medium">Configuración</span>
          )}
        </button>
      </div>
    </motion.aside>
    <DeleteConfirmationDialog
      target={deleteTarget}
      isDeleting={isDeleting}
      onCancel={handleCancelDelete}
      onConfirm={handleConfirmDelete}
    />
    </>
  );
}
