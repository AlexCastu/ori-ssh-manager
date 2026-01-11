import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  FolderInput,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';
import type { Session, SessionGroup, SessionColor } from '../types';

// Color configuration for dark mode
const colorConfigDark: Record<SessionColor, { bg: string; border: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-400' },
  green: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', dot: 'bg-green-400' },
  purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-400' },
  orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-400' },
  red: { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-400' },
  cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400', dot: 'bg-pink-400' },
  yellow: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400', dot: 'bg-yellow-400' },
};

// Color configuration for light mode
const colorConfigLight: Record<SessionColor, { bg: string; border: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-600', dot: 'bg-blue-500' },
  green: { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-600', dot: 'bg-green-500' },
  purple: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-600', dot: 'bg-purple-500' },
  orange: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-600', dot: 'bg-orange-500' },
  red: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-600', dot: 'bg-red-500' },
  cyan: { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-600', dot: 'bg-cyan-500' },
  pink: { bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-600', dot: 'bg-pink-500' },
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-600', dot: 'bg-yellow-500' },
};

const allColors: SessionColor[] = ['blue', 'green', 'purple', 'orange', 'red', 'cyan', 'pink', 'yellow'];

const getColor = (color: SessionColor, isDark: boolean) => {
  const config = isDark ? colorConfigDark : colorConfigLight;
  return config[color] || config.blue;
};

// Dropdown Portal Component
function DropdownPortal({
  children,
  anchorRef,
  isOpen,
  onClose
}: {
  children: React.ReactNode;
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const dropdownWidth = 180;
      const viewportPadding = 12;
      setPosition({
        top: rect.bottom + 4,
        left: Math.min(
          Math.max(rect.left, viewportPadding),
          window.innerWidth - dropdownWidth - viewportPadding
        ), // Clamp within viewport so it never clips to the left
      });
    }
  }, [isOpen, anchorRef]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999]"
        style={{ top: position.top, left: position.left }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

// Session Item Component
function SessionItem({
  session,
  isActive,
  sidebarCollapsed,
  groups,
  onSelect,
  onConnect,
  onEdit,
  onDelete,
  onMoveToGroup,
}: {
  session: Session;
  isActive: boolean;
  sidebarCollapsed: boolean;
  groups: SessionGroup[];
  onSelect: () => void;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveToGroup: (groupId: string | null) => void;
}) {
  const { isDark } = useTheme();
  const colors = getColor(session.color, isDark);
  const [showMenu, setShowMenu] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeAllMenus = () => {
    setShowMenu(false);
    setShowMoveMenu(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`
        relative p-2 rounded-lg cursor-pointer transition-all group
        ${isActive
          ? (isDark ? 'bg-zinc-800' : 'bg-zinc-200')
          : (isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100')
        }
      `}
    >
      <div className="flex items-center gap-2">
        {/* Server icon with session color */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors.bg} ${colors.border} shrink-0`}>
          <Server className={`w-4 h-4 ${colors.text}`} />
        </div>

        {/* Session info */}
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-sm truncate ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{session.name}</div>
            <div className={`text-xs truncate ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
              {session.username}@{session.host}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
              className={`p-1.5 rounded-md transition-colors ${
                isDark
                  ? 'hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400'
                  : 'hover:bg-blue-100 text-zinc-500 hover:text-blue-600'
              }`}
              title="Connect"
            >
              <Play className="w-3.5 h-3.5" />
            </button>

            {/* More menu button */}
            <div className="relative">
              <button
                ref={menuButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                  setShowMoveMenu(false);
                }}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark
                    ? 'hover:bg-zinc-700 text-zinc-400 hover:text-white'
                    : 'hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800'
                }`}
                title="More options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {/* Dropdown menu using Portal */}
              <DropdownPortal anchorRef={menuButtonRef} isOpen={showMenu} onClose={closeAllMenus}>
                <div className={`rounded-lg shadow-xl py-1 min-w-[160px] border ${
                  isDark
                    ? 'bg-zinc-800 border-zinc-700'
                    : 'bg-white border-zinc-200'
                }`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                      closeAllMenus();
                    }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                      isDark
                        ? 'text-zinc-300 hover:bg-zinc-700'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>

                  {/* Move to group submenu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMoveMenu(!showMoveMenu);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 justify-between ${
                        isDark
                          ? 'text-zinc-300 hover:bg-zinc-700'
                          : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FolderInput className="w-3.5 h-3.5" />
                        Move to
                      </span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showMoveMenu ? 'rotate-180' : '-rotate-90'}`} />
                    </button>

                    {showMoveMenu && (
                      <div className={`border-t mt-1 pt-1 ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`}>
                        {/* No group option */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToGroup(null);
                            closeAllMenus();
                          }}
                          className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                            !session.groupId
                              ? 'text-blue-400'
                              : isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full ${isDark ? 'bg-zinc-500' : 'bg-zinc-400'}`} />
                          No group
                        </button>

                        {/* Group options */}
                        {groups.map((group) => (
                          <button
                            key={group.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveToGroup(group.id);
                              closeAllMenus();
                            }}
                            className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                              session.groupId === group.id
                                ? 'text-blue-400'
                                : isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-zinc-700 hover:bg-zinc-100'
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-full ${getColor(group.color, isDark).dot}`} />
                            {group.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={`border-t my-1 ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                      closeAllMenus();
                    }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                      isDark
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'text-red-600 hover:bg-red-50'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </DropdownPortal>
            </div>
          </div>
        )}
      </div>

      {/* Jump host indicator */}
      {session.jumpHost && !sidebarCollapsed && (
        <div className={`mt-1 ml-[40px] text-[10px] ${isDark ? 'text-zinc-600' : 'text-zinc-500'}`}>
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
  const { isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-4 h-4 rounded-full ${getColor(selectedColor, isDark).dot} hover:ring-2 hover:ring-white/30 transition-all`}
        title="Change color"
      />

      <DropdownPortal anchorRef={buttonRef} isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className={`rounded-lg shadow-xl p-2 border ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
          <div className="grid grid-cols-4 gap-1.5">
            {allColors.map((color) => (
              <button
                key={color}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(color);
                  setIsOpen(false);
                }}
                className={`w-5 h-5 rounded-full ${getColor(color, isDark).dot} hover:scale-110 transition-transform ${
                  selectedColor === color
                    ? `ring-2 ring-offset-1 ${isDark ? 'ring-white ring-offset-zinc-800' : 'ring-zinc-800 ring-offset-white'}`
                    : ''
                }`}
                title={color}
              />
            ))}
          </div>
        </div>
      </DropdownPortal>
    </div>
  );
}

// Group Component
function GroupSection({
  group,
  sessions,
  allGroups,
  activeSessionId,
  sidebarCollapsed,
  onSelectSession,
  onConnectSession,
  onEditSession,
  onDeleteSession,
  onMoveSessionToGroup,
  onToggleExpand,
  onEditGroup,
  onDeleteGroup,
  onChangeGroupColor,
}: {
  group: SessionGroup;
  sessions: Session[];
  allGroups: SessionGroup[];
  activeSessionId: string | null;
  sidebarCollapsed: boolean;
  onSelectSession: (id: string) => void;
  onConnectSession: (session: Session) => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (session: Session) => void;
  onMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  onToggleExpand: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onChangeGroupColor: (color: SessionColor) => void;
}) {
  const { isDark } = useTheme();
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const colors = getColor(group.color, isDark);
  const groupSessions = sessions.filter((s) => s.groupId === group.id);

  // Collapsed view
  if (sidebarCollapsed) {
    return (
      <div className="mb-2">
        <div
          onClick={onToggleExpand}
          className={`p-2 rounded-lg cursor-pointer flex flex-col items-center gap-1 transition-all ${
            isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'
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
            groups={allGroups}
            onSelect={() => onSelectSession(session.id)}
            onConnect={() => onConnectSession(session)}
            onEdit={() => onEditSession(session)}
            onDelete={() => onDeleteSession(session)}
            onMoveToGroup={(gId) => onMoveSessionToGroup(session.id, gId)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-1 rounded-lg transition-all">
      {/* Group Header */}
      <div
        onClick={onToggleExpand}
        className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer group ${
          isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'
        }`}
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            isDark ? 'text-zinc-500' : 'text-zinc-400'
          } ${group.isExpanded ? '' : '-rotate-90'}`}
        />

        <ColorPicker selectedColor={group.color} onSelect={onChangeGroupColor} />

        <div className={colors.text}>
          {group.isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </div>
        <span className={`flex-1 text-sm font-medium truncate ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
          {group.name}
        </span>
        <span className={`text-xs tabular-nums ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {groupSessions.length}
        </span>

        {/* Group Menu */}
        <div className="relative">
          <button
            ref={menuButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-all ${
              isDark
                ? 'hover:bg-zinc-700 text-zinc-500 hover:text-white'
                : 'hover:bg-zinc-200 text-zinc-400 hover:text-zinc-700'
            }`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          <DropdownPortal anchorRef={menuButtonRef} isOpen={showMenu} onClose={() => setShowMenu(false)}>
            <div className={`rounded-lg shadow-xl py-1 min-w-[120px] border ${
              isDark
                ? 'bg-zinc-800 border-zinc-700'
                : 'bg-white border-zinc-200'
            }`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditGroup();
                  setShowMenu(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                  isDark
                    ? 'text-zinc-300 hover:bg-zinc-700'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }`}
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
                className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 ${
                  isDark
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-red-600 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </DropdownPortal>
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
            className="overflow-visible"
          >
            <div className={`ml-4 mt-1 space-y-0.5 border-l-2 pl-3 ${colors.border}`}>
              {groupSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={activeSessionId === session.id}
                  sidebarCollapsed={false}
                  groups={allGroups}
                  onSelect={() => onSelectSession(session.id)}
                  onConnect={() => onConnectSession(session)}
                  onEdit={() => onEditSession(session)}
                  onDelete={() => onDeleteSession(session)}
                  onMoveToGroup={(gId) => onMoveSessionToGroup(session.id, gId)}
                />
              ))}
              {groupSessions.length === 0 && (
                <div className={`text-xs py-3 px-2 text-center rounded-lg border-2 border-dashed ${
                  isDark
                    ? 'border-zinc-700/50 text-zinc-600'
                    : 'border-zinc-300 text-zinc-400'
                }`}>
                  No sessions in this group
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

  // Sessions without a group
  const ungroupedSessions = sessions.filter((s) => !s.groupId);

  // Handle moving session to a group
  const handleMoveToGroup = useCallback(async (sessionId: string, groupId: string | null) => {
    try {
      await updateSession(sessionId, { groupId });
    } catch (error) {
      console.error('Failed to move session:', error);
    }
  }, [updateSession]);

  const handleConnect = useCallback((session: Session) => {
    createTab(session.id);
  }, [createTab]);

  const handleEdit = useCallback((session: Session) => {
    openSessionModal({ session, mode: 'edit' });
  }, [openSessionModal]);

  const handleDelete = useCallback(async (session: Session) => {
    // In Tauri, confirm() doesn't work properly, so we delete directly
    // TODO: Add a proper confirmation dialog
    await deleteSession(session.id);
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
    // In Tauri, confirm() doesn't work properly, so we delete directly
    // Sessions in the group will be moved to ungrouped
    deleteGroup(groupId);
  }, [deleteGroup]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={`h-full backdrop-blur-xl border-r flex flex-col transition-colors ${
        isDark
          ? 'bg-zinc-900/50 border-zinc-800/50'
          : 'bg-white/80 border-zinc-200'
      }`}
    >
      {/* Header */}
      <div className={`p-3 flex items-center justify-end border-b ${isDark ? 'border-zinc-800/50' : 'border-zinc-200'}`}>
        <button
          onClick={toggleSidebar}
          className={`p-2 rounded-lg transition-colors ${
            isDark
              ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'
          }`}
          title={sidebarCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto overflow-x-visible p-2 scrollbar-hide">
        {/* Actions bar */}
        {!sidebarCollapsed && (
          <div className="mb-3 px-1 flex items-center justify-between">
            <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              All Sessions
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsAddingGroup(true)}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark
                    ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                    : 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700'
                }`}
                title="Add Group"
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark
                    ? 'hover:bg-zinc-800 text-zinc-500 hover:text-blue-400'
                    : 'hover:bg-zinc-100 text-zinc-400 hover:text-blue-600'
                }`}
                title="Add Session"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Collapsed: show groups with sessions as compact icons */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center gap-1 px-1">
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className={`p-2 rounded-lg transition-colors mb-2 ${
                isDark
                  ? 'hover:bg-zinc-800 text-zinc-500 hover:text-blue-400'
                  : 'hover:bg-zinc-100 text-zinc-400 hover:text-blue-600'
              }`}
              title="Add Session"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Show groups with their sessions */}
            {groups.map((group) => {
              const groupSessions = sessions.filter(s => s.groupId === group.id);
              const groupColors = getColor(group.color, isDark);

              if (groupSessions.length === 0) return null;

              return (
                <div key={group.id} className="w-full">
                  {/* Group indicator */}
                  <div
                    className={`mx-auto w-10 h-1 rounded-full mb-1 ${groupColors.dot}`}
                    title={group.name}
                  />
                  {/* Sessions in group */}
                  <div className="flex flex-col items-center gap-1">
                    {groupSessions.map((session) => {
                      const colors = getColor(session.color, isDark);
                      return (
                        <button
                          key={session.id}
                          onClick={() => handleConnect(session)}
                          className={`p-1.5 rounded-lg transition-all ${
                            activeSessionId === session.id
                              ? (isDark ? 'bg-zinc-800' : 'bg-zinc-200')
                              : (isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100')
                          }`}
                          title={`${group.name} > ${session.name}\n${session.username}@${session.host}`}
                        >
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${colors.bg} ${colors.border}`}>
                            <Server className={`w-3.5 h-3.5 ${colors.text}`} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="h-2" /> {/* Spacer between groups */}
                </div>
              );
            })}

            {/* Ungrouped sessions */}
            {ungroupedSessions.length > 0 && (
              <>
                {groups.length > 0 && (
                  <div className={`mx-auto w-10 h-[1px] my-1 ${isDark ? 'bg-zinc-700' : 'bg-zinc-300'}`} />
                )}
                {ungroupedSessions.map((session) => {
                  const colors = getColor(session.color, isDark);
                  return (
                    <button
                      key={session.id}
                      onClick={() => handleConnect(session)}
                      className={`p-1.5 rounded-lg transition-all ${
                        activeSessionId === session.id
                          ? (isDark ? 'bg-zinc-800' : 'bg-zinc-200')
                          : (isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100')
                      }`}
                      title={`${session.name}\n${session.username}@${session.host}`}
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${colors.bg} ${colors.border}`}>
                        <Server className={`w-3.5 h-3.5 ${colors.text}`} />
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Add Group Input */}
        {isAddingGroup && !sidebarCollapsed && (
          <div className="mb-3 px-1">
            <div className={`flex items-center gap-2 rounded-lg p-2 border ${
              isDark
                ? 'bg-zinc-800 border-zinc-700'
                : 'bg-zinc-50 border-zinc-200'
            }`}>
              <Folder className={`w-4 h-4 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name..."
                className={`flex-1 bg-transparent text-sm outline-none ${
                  isDark
                    ? 'text-white placeholder-zinc-500'
                    : 'text-zinc-900 placeholder-zinc-400'
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

        {/* Groups - only show when expanded */}
        {!sidebarCollapsed && (
          <div className="space-y-1">
            {groups.map((group) => (
              <div key={group.id}>
                {editingGroup === group.id ? (
                  <div className={`flex items-center gap-2 rounded-lg p-2 mb-2 border ${
                    isDark
                      ? 'bg-zinc-800 border-zinc-700'
                      : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <div className={`w-3 h-3 rounded-full ${getColor(group.color, isDark).dot}`} />
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className={`flex-1 bg-transparent text-sm outline-none ${
                        isDark ? 'text-white' : 'text-zinc-900'
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
                    sessions={sessions}
                    allGroups={groups}
                    activeSessionId={activeSessionId}
                    sidebarCollapsed={sidebarCollapsed}
                    onSelectSession={setActiveSession}
                    onConnectSession={handleConnect}
                    onEditSession={handleEdit}
                    onDeleteSession={handleDelete}
                    onMoveSessionToGroup={handleMoveToGroup}
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

            {/* Ungrouped Sessions */}
            {ungroupedSessions.length > 0 && (
              <>
                {groups.length > 0 && (
                  <div className={`px-2 py-2 text-xs font-medium ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Ungrouped
                  </div>
                )}
                {ungroupedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={activeSessionId === session.id}
                    sidebarCollapsed={false}
                    groups={groups}
                    onSelect={() => setActiveSession(session.id)}
                    onConnect={() => handleConnect(session)}
                    onEdit={() => handleEdit(session)}
                    onDelete={() => handleDelete(session)}
                    onMoveToGroup={(gId) => handleMoveToGroup(session.id, gId)}
                  />
                ))}
              </>
            )}

            {/* Empty state */}
            {sessions.length === 0 && (
              <div className={`text-center py-8 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm mb-3">No sessions yet</p>
                <button
                  onClick={() => openSessionModal({ mode: 'create' })}
                  className={`text-sm font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
                >
                  Add your first session
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
}
