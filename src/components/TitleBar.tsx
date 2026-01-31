import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';
import { Minus, Square, X, Maximize2, Settings } from 'lucide-react';
import { Logo } from './Logo';
import { useStore } from '../store/useStore';

interface TitleBarProps {
  className?: string;
}

export function TitleBar({ className = '' }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const { openSettingsModal } = useStore();

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    setIsMacOS(platform.includes('mac'));

    const checkMaximized = async () => {
      try {
        const appWindow = getCurrentWindow();
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.warn('Could not check maximized state:', error);
      }
    };

    checkMaximized();

    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (error) {
      console.error('Failed to toggle maximize:', error);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close:', error);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className={`h-12 flex items-center justify-between border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl select-none ${className}`}
    >
      {/* Left side - Logo and title */}
      <div className="flex items-center" data-tauri-drag-region>
        {isMacOS && <div className="w-[70px]" data-tauri-drag-region />}

        <div className="flex items-center gap-3 px-4" data-tauri-drag-region>
          <Logo size={26} />
          <div className="flex items-center gap-2.5" data-tauri-drag-region>
            <span className="text-sm font-semibold text-white tracking-tight" data-tauri-drag-region>
              SSH Manager
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
              v1.0
            </span>
          </div>
        </div>
      </div>

      {/* Right side - Settings and window controls */}
      <div className="flex items-center gap-1 pr-3" data-tauri-drag-region>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => openSettingsModal()}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </motion.button>

        {!isMacOS && (
          <div className="flex items-center ml-2 gap-0.5">
            <motion.button
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMinimize}
              className="p-2 rounded text-zinc-400 hover:text-white transition-colors"
              title="Minimize"
            >
              <Minus className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMaximize}
              className="p-2 rounded text-zinc-400 hover:text-white transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </motion.button>
            <motion.button
              whileHover={{ backgroundColor: 'rgba(239,68,68,0.2)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleClose}
              className="p-2 rounded text-zinc-400 hover:text-red-400 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}
