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
  FolderInput,
  Settings,
  Search,
  X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Session, SessionGroup, SessionColor } from '../types';

// Color configuration
const colorConfig: Record<SessionColor, { bg: string; border: string; text: string; dot: string }> = {
  blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-400' },
  green: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', dot: 'bg-green-400' },
  purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-400' },
  orange: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', dot: 'bg-orange-400' },
  red: { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400', dot: 'bg-red-400' },
  cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400', dot: 'bg-pink-400' },
  yellow: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400', dot: 'bg-yellow-400' },
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
}: {
  session: Session;
  isActive: boolean;
  sidebarCollapsed: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, sessionId: string) => void;
}) {
  const colors = getColor(session.color);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      draggable={!sidebarCollapsed}
      onDragStart={(e) => onDragStart(e, session.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
      className={`
        relative p-2 rounded-lg cursor-pointer transition-all group
        ${isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'}
      `}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        {!sidebarCollapsed && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400">
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
            <div className="font-medium text-sm text-zinc-200 truncate">{session.name}</div>
            <div className="text-xs text-zinc-500 truncate">
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
              className="p-1.5 rounded-md hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400 transition-colors"
              title="Connect"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-md hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Jump host indicator */}
      {session.jumpHost && !sidebarCollapsed && (
        <div className="mt-1 ml-[52px] text-[10px] text-zinc-600">
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
        title="Change color"
      />

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-6 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-2">
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
                    selectedColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800' : ''
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
            isDragOver ? 'bg-blue-500/20 ring-2 ring-blue-500' : 'hover:bg-zinc-800/50'
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
        className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-zinc-800/50 group"
      >
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${group.isExpanded ? '' : '-rotate-90'}`}
        />

        <ColorPicker selectedColor={group.color} onSelect={onChangeGroupColor} />

        <div className={colors.text}>
          {group.isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
        </div>
        <span className="flex-1 text-sm font-medium text-zinc-300 truncate">{group.name}</span>
        <span className="text-xs text-zinc-600 tabular-nums">{groupSessions.length}</span>

        {/* Group Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-white transition-all"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditGroup();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
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
                  className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
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
            <div className={`ml-4 mt-1 space-y-0.5 border-l-2 pl-3 ${colors.border}`}>
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
                />
              ))}
              {groupSessions.length === 0 && (
                <div className={`text-xs py-3 px-2 text-center rounded-lg border-2 border-dashed ${
                  isDragOver ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-zinc-700/50 text-zinc-600'
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
    addGroup,
    updateGroup,
    deleteGroup,
    toggleGroupExpanded,
    updateSession,
  } = useStore();

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

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, sessionId: string) => {
    console.log('Drag started:', sessionId);
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

  const handleDragLeave = useCallback(() => {
    setDragOverGroupId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const sessionId = e.dataTransfer.getData('text/plain');
    console.log('Drop:', sessionId, 'to group:', groupId);

    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.groupId !== groupId) {
        console.log('Moving session to group');
        await updateSession(sessionId, { groupId });
      }
    }

    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [sessions, updateSession]);

  const handleDropToUngrouped = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const sessionId = e.dataTransfer.getData('text/plain');
    console.log('Drop to ungrouped:', sessionId);

    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session && session.groupId) {
        console.log('Removing from group');
        await updateSession(sessionId, { groupId: undefined });
      }
    }

    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [sessions, updateSession]);

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
    if (confirm(`Delete session "${session.name}"?`)) {
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
    if (confirm('Delete this group? Sessions will be moved to ungrouped.')) {
      deleteGroup(groupId);
    }
  }, [deleteGroup]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-full bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-800/50 flex flex-col"
      onDragEnd={handleDragEnd}
    >
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-zinc-800/50">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-6 h-6 rounded" />
            <span className="font-medium text-zinc-200">Sessions</span>
          </div>
        )}

        {sidebarCollapsed && (
          <img src="/logo.png" alt="Logo" className="w-6 h-6 rounded mx-auto" />
        )}

        <button
          onClick={toggleSidebar}
          className={`p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors ${sidebarCollapsed ? 'mx-auto mt-2' : ''}`}
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
                className="w-full pl-8 pr-8 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
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
              <button
                onClick={() => setIsAddingGroup(true)}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Add Group"
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                onClick={() => openSessionModal({ mode: 'create' })}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-blue-400 transition-colors"
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
            <button
              onClick={() => openSessionModal({ mode: 'create' })}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-blue-400 transition-colors"
              title="Add Session"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Add Group Input */}
        {isAddingGroup && !sidebarCollapsed && (
          <div className="mb-3 px-1">
            <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-2 border border-zinc-700">
              <Folder className="w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name..."
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
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
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-2 mb-2 border border-zinc-700">
                  <div className={`w-3 h-3 rounded-full ${getColor(group.color).dot}`} />
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-white outline-none"
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
                <div className="px-2 py-2 text-xs text-zinc-600 font-medium">Ungrouped</div>
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
                />
              ))}
            </>
          )}

          {/* Drop zone for removing from group */}
          {!sidebarCollapsed && groups.length > 0 && draggingSessionId && (
            <div
              className={`mt-3 p-3 rounded-lg border-2 border-dashed transition-all ${
                dragOverGroupId === 'ungrouped'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-zinc-700 text-zinc-500'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverGroupId('ungrouped');
              }}
              onDragLeave={() => setDragOverGroupId(null)}
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
                className="text-blue-400 hover:text-blue-300 text-xs font-medium"
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
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                Add your first session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings button at bottom */}
      <div className={`p-3 border-t ${isDark ? 'border-zinc-800/50' : 'border-zinc-200'}`}>
        <button
          onClick={() => openSettingsModal()}
          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
            isDark
              ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'
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
