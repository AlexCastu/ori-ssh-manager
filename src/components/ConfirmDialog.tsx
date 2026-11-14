import { Trash2, AlertTriangle } from 'lucide-react';

// Reusable confirmation dialog (replaces the native window.confirm, which is
// blocking and looks out of place inside the Tauri WebView).
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  danger = true,
  busy = false,
  busyLabel = 'Procesando...',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const Icon = danger ? Trash2 : AlertTriangle;
  const accent = danger
    ? 'bg-superficie text-peligro'
    : 'bg-superficie text-acento';
  const confirmBtn = danger
    ? 'rounded-full px-5 py-2 font-medium text-texto bg-peligro shadow-lg transition hover:brightness-110 disabled:opacity-50'
    : 'btn-primario';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        aria-label={cancelLabel}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-cristal relative w-full max-w-sm p-5 text-texto"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-texto">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-texto-suave">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secundario text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 text-sm disabled:cursor-not-allowed ${confirmBtn}`}
          >
            {danger && <Trash2 className="h-4 w-4" />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
