import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Handle,
  NodeResizer,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  X,
  Network,
  Monitor,
  Server,
  Laptop,
  KeyRound,
  Lock,
  Cpu,
  ScrollText,
  Download,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';
import { fetchSessionLogs, clearSessionLogs } from '../utils/sessionLog';
import type { AuthMethod, Session, SessionLog, SessionLogKind } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

// ==================== MAP ====================

type NodeTone = 'local' | 'hop' | 'dest';

interface HopNodeData extends Record<string, unknown> {
  title: string;
  subtitle?: string;
  lines: string[];
  tone: NodeTone;
  authMethod?: AuthMethod;
  connected: boolean;
}

const AUTH_ICON: Record<AuthMethod, typeof KeyRound> = {
  key: KeyRound,
  password: Lock,
  agent: Cpu,
};

const AUTH_LABEL: Record<AuthMethod, string> = {
  key: 'Clave',
  password: 'Contraseña',
  agent: 'Agente',
};

function HopNode({ data, selected }: NodeProps<Node<HopNodeData>>) {
  const Icon = data.tone === 'local' ? Laptop : data.tone === 'dest' ? Monitor : Server;
  const AuthIcon = data.authMethod ? AUTH_ICON[data.authMethod] : null;
  const ring =
    data.tone === 'dest'
      ? data.connected
        ? 'border-green-500'
        : 'border-zinc-400 dark:border-zinc-600'
      : data.tone === 'local'
        ? 'border-blue-500'
        : 'border-amber-500';

  return (
    <div
      className={`flex h-full w-full flex-col rounded-xl border-2 ${ring} bg-white dark:bg-zinc-800 shadow-lg px-3 py-2`}
    >
      <NodeResizer isVisible={selected} minWidth={150} minHeight={64} />
      {data.tone !== 'local' && <Handle type="target" position={Position.Left} />}
      {data.tone !== 'dest' && <Handle type="source" position={Position.Right} />}
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 text-zinc-500 dark:text-zinc-300 flex-shrink-0" />
        <span
          className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 dark:text-white break-all leading-tight"
          title={data.title}
        >
          {data.title}
        </span>
        {data.tone === 'dest' && (
          <span
            className={`mt-1 w-2.5 h-2.5 flex-shrink-0 rounded-full ${
              data.connected ? 'bg-green-500' : 'bg-zinc-400'
            }`}
            title={data.connected ? 'Conectado' : 'Desconectado'}
          />
        )}
      </div>
      {data.subtitle && (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 break-all" title={data.subtitle}>
          {data.subtitle}
        </div>
      )}
      {data.lines.map((line) => (
        <div key={line} className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 break-all">
          {line}
        </div>
      ))}
      {AuthIcon && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <AuthIcon className="w-3 h-3" />
          {AUTH_LABEL[data.authMethod!]}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { hop: HopNode };
const NODE_GAP = 230;

function SessionMap({
  sessionId,
}: {
  sessionId: string;
}) {
  const { sessions, tabs } = useStore(
    useShallow((s) => ({ sessions: s.sessions, tabs: s.tabs }))
  );
  const session = sessions.find((s) => s.id === sessionId);
  const connected = tabs.some((t) => t.sessionId === sessionId && t.status === 'connected');

  const { nodes, edges } = useMemo(() => {
    const nodes: Node<HopNodeData>[] = [];
    const edges: Edge[] = [];
    if (!session) return { nodes, edges };

    let col = 0;
    const push = (data: HopNodeData) => {
      nodes.push({
        id: String(col),
        type: 'hop',
        position: { x: col * NODE_GAP, y: 0 },
        data,
        connectable: false,
        style: { width: 210 },
      });
      if (col > 0) {
        edges.push({
          id: `e${col - 1}-${col}`,
          source: String(col - 1),
          target: String(col),
          animated: connected,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }
      col++;
    };

    push({ title: 'Tú', subtitle: 'Equipo local', lines: [], tone: 'local', connected });

    (session.jumpHops ?? []).forEach((hop, i) => {
      push({
        title: hop.name?.trim() || `Salto ${i + 1}`,
        subtitle: `${hop.host}:${hop.port}`,
        lines: [hop.username ? `${hop.username}@` : '(usuario de sesión)'],
        tone: 'hop',
        authMethod: hop.authMethod,
        connected,
      });
    });

    push({
      title: session.name,
      subtitle: `${session.host}:${session.port}`,
      lines: [`${session.username}@`],
      tone: 'dest',
      authMethod: session.authMethod,
      connected,
    });

    return { nodes, edges };
  }, [session, connected]);

  if (!session) return null;

  return (
    <div className="h-full w-full">
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={3}
        nodesConnectable={false}
        zoomOnScroll
        zoomOnPinch
        panOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <Panel position="top-center">
          <span className="rounded-md bg-zinc-900/70 px-2 py-1 text-[11px] text-zinc-200 backdrop-blur">
            Rueda: zoom · arrastra el nodo: mover · clic + tiradores: redimensionar
          </span>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// ==================== LOG ====================

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function SessionLogView({ sessionId }: { sessionId: string }) {
  const addToast = useStore((s) => s.addToast);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [filter, setFilter] = useState<'all' | SessionLogKind>('all');
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await fetchSessionLogs(sessionId));
    } catch (err) {
      console.error('get_session_logs failed:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = filter === 'all' ? logs : logs.filter((l) => l.kind === filter);

  const handleExport = useCallback(async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      let defaultPath = `registro-${sessionId}.json`;
      try {
        const { downloadDir, join } = await import('@tauri-apps/api/path');
        defaultPath = await join(await downloadDir(), defaultPath);
      } catch {
        // fall back to a bare filename
      }
      const path = await save({
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const count = await invoke<number>('export_session_logs_to_path', { sessionId, path });
      addToast({
        type: 'success',
        title: 'Registro exportado',
        message: `${count} entrada(s)`,
        duration: 4000,
      });
    } catch (err) {
      console.error('export_session_logs failed:', err);
      addToast({ type: 'error', title: 'Error', message: 'No se pudo exportar el registro' });
    }
  }, [sessionId, addToast]);

  const handleClear = useCallback(async () => {
    setConfirmClear(false);
    try {
      await clearSessionLogs(sessionId);
      await reload();
      addToast({ type: 'success', title: 'Registro limpiado', message: '' });
    } catch (err) {
      console.error('clear_session_logs failed:', err);
      addToast({ type: 'error', title: 'Error', message: 'No se pudo limpiar el registro' });
    }
  }, [sessionId, reload, addToast]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-white/5 px-4 py-2">
        <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs">
          {(['all', 'event', 'command'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === f
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {f === 'all' ? 'Todo' : f === 'event' ? 'Eventos' : 'Comandos'}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-400">{visible.length} entrada(s)</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => void reload()}
            title="Recargar"
            className="p-1.5 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/10 text-zinc-500"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => void handleExport()}
            title="Exportar"
            className="p-1.5 rounded-lg hover:bg-zinc-900/5 dark:hover:bg-white/10 text-zinc-500"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            title="Limpiar"
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-400">
            Sin entradas
          </div>
        ) : (
          visible.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-zinc-900/5 dark:hover:bg-white/5"
            >
              <span className="text-zinc-400 whitespace-nowrap">{formatTs(log.ts)}</span>
              <span
                className={`px-1.5 rounded text-[10px] uppercase font-semibold ${
                  log.kind === 'command'
                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                }`}
              >
                {log.kind === 'command' ? 'cmd' : 'evt'}
              </span>
              <span className="text-zinc-700 dark:text-zinc-200 break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Limpiar registro"
        description="¿Eliminar todas las entradas del registro de esta sesión? No se puede deshacer."
        confirmLabel="Limpiar"
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

// ==================== MODAL ====================

// Gate: only mount the body while open so its tab state resets to "map" on
// every open without a setState-in-effect (see GroupModal for the same pattern).
export function SessionInfoModal() {
  const { infoModal, closeInfoModal } = useStore(
    useShallow((s) => ({ infoModal: s.infoModal, closeInfoModal: s.closeInfoModal }))
  );
  if (!infoModal.isOpen || !infoModal.data) return null;
  return (
    <SessionInfoModalBody session={infoModal.data.session} onClose={closeInfoModal} />
  );
}

function SessionInfoModalBody({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'map' | 'log'>('map');
  const closeInfoModal = onClose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeInfoModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative flex h-[90vh] w-[90vw] flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20">
              <Network className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{session.name}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {session.host}:{session.port}
              </p>
            </div>
          </div>
          <button
            onClick={closeInfoModal}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-white/5 px-4">
          {([
            { id: 'map', label: 'Mapa', icon: Network },
            { id: 'log', label: 'Registro', icon: ScrollText },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === id
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {tab === 'map' ? (
            <SessionMap sessionId={session.id} />
          ) : (
            <SessionLogView sessionId={session.id} />
          )}
        </div>
      </motion.div>
    </div>
  );
}
