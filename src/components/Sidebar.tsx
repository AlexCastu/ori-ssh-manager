import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Plus,
  Upload,
  ChevronLeft,
  ChevronDown,
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
import { parseSessionsFile } from '../utils/sessionImport';
import { ICON_NAMES, DEFAULT_SESSION_ICON } from '../utils/icons';
import { DynamicIcon, GroupIconView } from '../utils/IconView';
import { colorConfig, COLOR_NAMES as allColors, getColor } from '../utils/colors';

const SESSION_DRAG_MIME = 'application/x-ori-session-id';

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
    ? `¿Eliminar "${name}"? Las sesiones de esta carpeta pasarán a Sin carpeta.`
    : `¿Eliminar "${name}"? Se borra la sesión SSH guardada.`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-label="Cancelar"
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
              {isGroup ? 'Eliminar carpeta' : 'Eliminar sesión'}
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
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
      ? ` (via ${session.jumpHops.map((hop) => hop.host).join(' → ')})`
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
        className={`my-0.5 p-1 rounded-md cursor-pointer flex items-center justify-center transition-all duration-100 ${
          isActive ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 hover:scale-105 active:scale-95'
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
      className={`group relative flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors duration-100 ${
        isActive ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70'
      }`}
    >
      {/* The small colored dot the user likes, unless a custom icon is set */}
      {session.icon ? (
        <DynamicIcon name={session.icon} className={`w-3.5 h-3.5 shrink-0 ${colors.text}`} />
      ) : (
        <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
      )}
      <span className="flex-1 min-w-0 truncate text-[13px] text-zinc-800 dark:text-zinc-200">{session.name}</span>

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
          className="p-1 rounded hover:bg-blue-500/20 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
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
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
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
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
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
            className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
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
            className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
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
        className={`w-4 h-4 rounded-full ${colorConfig[selectedColor].dot} hover:ring-2 hover:ring-zinc-900/30 dark:hover:ring-white/30 transition-all`}
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
        className={`p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${colors.text}`}
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
                className={`w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${
                  selectedIcon === name ? 'bg-zinc-200 dark:bg-zinc-700 ring-1 ring-blue-500' : ''
                }`}
                title={name}
              >
                <DynamicIcon name={name} className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
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
  onDragStart: (e: React.DragEvent, sessionId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, groupId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, groupId: string) => void;
}

// Group Component with Drop Zone (renders its child folders recursively)
function GroupSection({ group, depth, h }: { group: SessionGroup; depth: number; h: TreeHandlers }) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const colors = getColor(group.color);
  const groupSessions = h.sessions.filter((s) => s.groupId === group.id);
  const childGroups = h.groups.filter((g) => (g.parentId ?? null) === group.id);
  const isDragOver = h.dragOverGroupId === group.id;

  // Collapsed view: icon box (group color) + nested content when expanded
  if (h.sidebarCollapsed) {
    return (
      <div className="mb-2">
        <div
          onClick={() => h.onToggleExpand(group.id)}
          onDragOver={(e) => h.onDragOver(e, group.id)}
          onDragLeave={h.onDragLeave}
          onDrop={(e) => h.onDrop(e, group.id)}
          className={`p-1 my-0.5 rounded-md cursor-pointer flex items-center justify-center transition-all duration-100 ${
            isDragOver
              ? 'bg-blue-500/20 ring-2 ring-blue-500'
              : 'hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 hover:scale-105 active:scale-95'
          }`}
          title={`${group.name} (${groupSessions.length})${group.notes ? `\n\n${group.notes}` : ''}`}
        >
          <div className={`w-7 h-7 rounded-md border flex items-center justify-center ${colors.bg} ${colors.border} ${colors.text}`}>
            <GroupIconView name={group.icon} isExpanded={group.isExpanded} className="w-4 h-4" />
          </div>
        </div>
        {group.isExpanded && childGroups.map((child) => (
          <GroupSection key={child.id} group={child} depth={depth + 1} h={h} />
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
      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2 mb-1 border border-zinc-300 dark:border-zinc-700">
        <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
        <input
          type="text"
          value={h.editGroupName}
          onChange={(e) => h.setEditGroupName(e.target.value)}
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white outline-none"
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
      className={`mb-1 rounded-lg transition-all ${isDragOver ? 'bg-blue-500/10 ring-2 ring-blue-500/50' : ''}`}
      onDragOver={(e) => h.onDragOver(e, group.id)}
      onDragLeave={h.onDragLeave}
      onDrop={(e) => h.onDrop(e, group.id)}
    >
      {/* Group Header */}
      <div
        onClick={() => h.onToggleExpand(group.id)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 group"
      >
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${group.isExpanded ? '' : '-rotate-90'}`}
        />

        <ColorPicker selectedColor={group.color} onSelect={(color) => h.onChangeGroupColor(group.id, color)} />

        <IconPicker
          selectedIcon={group.icon}
          color={group.color}
          onSelect={(icon) => h.onChangeGroupIcon(group.id, icon)}
        />

        <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{group.name}</span>
        {group.notes ? <NoteBadge notes={group.notes} /> : null}
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
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
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
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
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
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center gap-2"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Añadir subcarpeta
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onDeleteGroup(group.id);
                  setMenuAnchor(null);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
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
            <div className={`ml-3 mt-0.5 space-y-px border-l pl-2 ${colors.border}`}>
              {childGroups.map((child) => (
                <GroupSection key={child.id} group={child} depth={depth + 1} h={h} />
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
                <div className={`text-xs py-3 px-2 text-center rounded-lg border-2 border-dashed ${
                  isDragOver ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border-zinc-300 dark:border-zinc-700/50 text-zinc-400 dark:text-zinc-600'
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
  const topLevelGroups = groups.filter((g) => !g.parentId);

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

  const handleDelete = useCallback((session: Session) => {
    setDeleteTarget({ type: 'session', session });
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
          icon: 'folder',
          isExpanded: true,
          parentId: null,
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
      className="relative h-full shrink-0 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-800/50 flex flex-col"
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
            isResizing ? 'bg-blue-500/60' : 'hover:bg-blue-500/40'
          }`}
          title="Arrastra para redimensionar (doble clic para restablecer)"
        />
      )}
      {/* Header */}
      <div
        className={`p-3 flex border-b border-zinc-200 dark:border-zinc-800/50 ${
          sidebarCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'
        }`}
      >
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-6 h-6 rounded" />
          {!sidebarCollapsed && <span className="font-medium text-zinc-800 dark:text-zinc-200">Sesiones</span>}
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
                placeholder="Buscar sesiones..."
                className="w-full pl-8 pr-8 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700/50 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
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
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
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
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Importar sesiones"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowExportWarn(true)}
                disabled={isExporting || sessions.length === 0}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar sesiones"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => openGroupModal({ mode: 'create', parentId: null })}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                title="Añadir carpeta"
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Importar sesiones"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowExportWarn(true)}
              disabled={isExporting || sessions.length === 0}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exportar sesiones"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="Añadir sesión"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Groups (nested folders rendered recursively) */}
        <div className="space-y-1">
          {topLevelGroups.map((group) => (
            <GroupSection key={group.id} group={group} depth={0} h={treeHandlers} />
          ))}

          {/* Sesiones sin carpeta */}
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
              <p className="text-xs text-center">↓ Quitar de la carpeta</p>
            </div>
          )}

          {/* No search results */}
          {filteredSessions.length === 0 && searchQuery && !sidebarCollapsed && (
            <div className="text-center py-6 text-zinc-500">
              <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-2">Ninguna sesión coincide con "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}

          {/* Empty state */}
          {sessions.length === 0 && !sidebarCollapsed && (
            <div className="text-center py-8 text-zinc-500">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm mb-3">Aún no hay sesiones</p>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
              >
                Añade tu primera sesión
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
    <ConfirmDialog
      open={showExportWarn}
      danger={false}
      title="Exportar sesiones"
      description="El archivo JSON incluirá las contraseñas y passphrases en TEXTO PLANO. Guárdalo en un lugar seguro. ¿Continuar?"
      confirmLabel="Exportar"
      onConfirm={handleExport}
      onCancel={() => setShowExportWarn(false)}
    />
    </>
  );
}
