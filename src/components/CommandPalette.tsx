import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, CornerDownLeft, Folder } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { fuzzyRank } from '../utils/fuzzy';
import { getColor } from '../utils/colors';
import type { Session, SessionGroup } from '../types';

const MAX_RESULTS = 50;

// Gate: a global Cmd/Ctrl+K listener stays mounted; the body remounts on open
// so its query/selection reset without a setState-in-effect.
export function CommandPalette() {
  const { open, toggle } = useStore(
    useShallow((s) => ({ open: s.commandPaletteOpen, toggle: s.toggleCommandPalette }))
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  if (!open) return null;
  return <CommandPaletteBody />;
}

function CommandPaletteBody() {
  const { sessions, groups, createTab, close } = useStore(
    useShallow((s) => ({
      sessions: s.sessions,
      groups: s.groups,
      createTab: s.createTab,
      close: s.closeCommandPalette,
    }))
  );

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groupName = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g: SessionGroup) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const results = useMemo(() => {
    const haystack = (s: Session) =>
      `${s.name} ${s.username}@${s.host}:${s.port} ${
        s.groupId ? groupName.get(s.groupId) ?? '' : ''
      } ${s.notes ?? ''}`;
    return fuzzyRank(query, sessions, haystack).slice(0, MAX_RESULTS);
  }, [query, sessions, groupName]);

  const activeIndex = Math.min(selected, Math.max(results.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the highlighted row visible (DOM sync, not state)
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const connect = (session?: Session) => {
    if (!session) return;
    createTab(session.id);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      connect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={close}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl"
      >
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-white/5 px-4">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar sesión y conectar…"
            className="flex-1 bg-transparent py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
          />
          <kbd className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">
              Sin coincidencias
            </div>
          ) : (
            results.map((s, i) => {
              const colors = getColor(s.color);
              const isActive = i === activeIndex;
              const folder = s.groupId ? groupName.get(s.groupId) : undefined;
              return (
                <button
                  key={s.id}
                  data-idx={i}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => connect(s)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                    isActive ? 'bg-cyan-500/10' : ''
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-zinc-800 dark:text-zinc-100">
                      {s.name}
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-xs text-zinc-500">
                      {folder && (
                        <>
                          <Folder className="h-3 w-3" />
                          <span className="truncate">{folder}</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="truncate">
                        {s.username}@{s.host}:{s.port}
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-400">
                      <CornerDownLeft className="h-3 w-3" /> conectar
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-zinc-200 dark:border-white/5 px-4 py-2 text-[11px] text-zinc-400">
          <span>↑↓ navegar</span>
          <span>⏎ conectar</span>
          <span className="ml-auto">⌘K / Ctrl+K para abrir</span>
        </div>
      </motion.div>
    </div>
  );
}
