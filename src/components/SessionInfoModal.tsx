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
  const ring = data.tone === 'dest' ? 'border-acento' : 'border-borde-fuerte';

  return (
    <div
      className={`tarjeta flex h-full w-full flex-col border-2 ${ring} bg-panel backdrop-blur-2xl shadow-lg px-3 py-2`}
    >
      <NodeResizer isVisible={selected} minWidth={150} minHeight={64} color="var(--acento)" />
      {data.tone !== 'local' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: 'var(--acento)', borderColor: 'var(--borde-fuerte)' }}
        />
      )}
      {data.tone !== 'dest' && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: 'var(--acento)', borderColor: 'var(--borde-fuerte)' }}
        />
      )}
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 text-texto-suave flex-shrink-0" />
        <span
          className="min-w-0 flex-1 text-sm font-semibold text-texto break-all leading-tight"
          title={data.title}
        >
          {data.title}
        </span>
        {data.tone === 'dest' && (
          <span
            className={`mt-1 w-2.5 h-2.5 flex-shrink-0 rounded-full ${
              data.connected ? 'bg-exito' : 'bg-texto-tenue'
            }`}
            title={data.connected ? 'Conectado' : 'Desconectado'}
          />
        )}
      </div>
      {data.subtitle && (
        <div className="mt-0.5 text-xs text-texto-tenue break-all" title={data.subtitle}>
          {data.subtitle}
        </div>
      )}
      {data.lines.map((line) => (
        <div key={line} className="mt-1 text-xs text-texto-suave break-all">
          {line}
        </div>
      ))}
      {AuthIcon && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-texto-tenue">
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
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--texto-tenue)' },
          style: { stroke: 'var(--texto-tenue)' },
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
    <div className="h-full w-full bg-hundido">
      <ReactFlow
        key={connected ? 'connected' : 'disconnected'}
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
        <Background color="var(--borde-fuerte)" />
        <Controls showInteractive={false} />
        <Panel position="top-center">
          <span className="rounded-full bg-panel border border-borde px-3 py-1 text-[11px] text-texto-suave backdrop-blur-2xl">
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
      <div className="flex items-center gap-2 border-b border-borde px-4 py-2">
        <div className="flex rounded-full bg-hundido p-0.5 text-xs">
          {(['all', 'event', 'command'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                filter === f
                  ? 'bg-superficie-fuerte text-texto'
                  : 'text-texto-tenue'
              }`}
            >
              {f === 'all' ? 'Todo' : f === 'event' ? 'Eventos' : 'Comandos'}
            </button>
          ))}
        </div>
        <span className="text-xs text-texto-tenue">{visible.length} entrada(s)</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => void reload()}
            title="Recargar"
            className="btn-icono"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => void handleExport()}
            title="Exportar"
            className="btn-icono"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            title="Limpiar"
            className="btn-icono hover:text-peligro"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-texto-tenue">
            Sin entradas
          </div>
        ) : (
          visible.map((log) => (
            <div
              key={log.id}
              className="fila flex items-start gap-2"
            >
              <span className="text-texto-tenue whitespace-nowrap">{formatTs(log.ts)}</span>
              <span
                className={`px-1.5 rounded text-[10px] uppercase font-semibold ${
                  log.kind === 'command'
                    ? 'bg-superficie text-acento-2'
                    : 'bg-superficie text-acento'
                }`}
              >
                {log.kind === 'command' ? 'cmd' : 'evt'}
              </span>
              <span className="text-texto-suave break-all">{log.message}</span>
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="modal-cristal relative flex h-[90vh] w-[90vw] flex-col overflow-hidden text-texto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-borde p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-acento to-acento-2">
              <Network className="h-5 w-5 text-texto" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-texto">{session.name}</h2>
              <p className="text-sm text-texto-suave">
                {session.host}:{session.port}
              </p>
            </div>
          </div>
          <button
            onClick={closeInfoModal}
            className="btn-icono"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex self-start gap-1 m-4 p-1 rounded-full bg-hundido border border-borde">
          {([
            { id: 'map', label: 'Mapa', icon: Network },
            { id: 'log', label: 'Registro', icon: ScrollText },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${
                tab === id
                  ? 'border-acento bg-superficie-fuerte text-texto'
                  : 'border-transparent text-texto-suave hover:bg-superficie-hover hover:text-texto'
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
