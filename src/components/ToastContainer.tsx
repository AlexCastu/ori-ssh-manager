import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/useStore';

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: 'text-exito',
  error: 'text-peligro',
  warning: 'text-aviso',
  info: 'text-acento',
};

export function ToastContainer() {
  const { toasts, removeToast } = useStore(
    useShallow((s) => ({ toasts: s.toasts, removeToast: s.removeToast }))
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          const colorClass = colors[toast.type];

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="modal-cristal flex items-start gap-3 p-4 rounded-2xl text-texto"
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colorClass}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-texto">{toast.title}</p>
                <p className="text-sm text-texto-suave mt-0.5">{toast.message}</p>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="btn-secundario mt-2 px-2.5 py-1 text-xs font-medium"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="btn-icono"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
