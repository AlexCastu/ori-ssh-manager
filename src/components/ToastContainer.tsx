import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useStore } from '../store/useStore';

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success:
    'bg-green-50/95 border-green-300 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400',
  error:
    'bg-red-50/95 border-red-300 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400',
  warning:
    'bg-yellow-50/95 border-yellow-300 text-yellow-700 dark:bg-yellow-500/10 dark:border-yellow-500/20 dark:text-yellow-400',
  info: 'bg-blue-50/95 border-blue-300 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400',
};

export function ToastContainer() {
  const { toasts, removeToast } = useStore();

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
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              className={`
                flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl
                ${colorClass}
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-900 dark:text-white">{toast.title}</p>
                <p className="text-sm opacity-80 mt-0.5">{toast.message}</p>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="mt-2 px-2.5 py-1 text-xs font-medium rounded-lg border border-current/30 hover:bg-zinc-900/10 dark:hover:bg-white/10 transition-colors"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg hover:bg-zinc-900/10 dark:hover:bg-white/10 transition-colors"
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
