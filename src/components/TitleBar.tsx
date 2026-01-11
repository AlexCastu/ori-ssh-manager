import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';
import { Minus, Square, X, Maximize2, Settings } from 'lucide-react';
import { Logo } from './Logo';
import { useStore } from '../store/useStore';
import { useTheme } from '../contexts/ThemeContext';

interface TitleBarProps {
  className?: string;
}

export function TitleBar({ className = '' }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const { openSettingsModal } = useStore();
  const { isDark } = useTheme();

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
      className={`h-12 flex items-center justify-between border-b backdrop-blur-xl select-none transition-colors ${
        isDark
          ? 'border-zinc-800/50 bg-zinc-900/80'
          : 'border-zinc-200 bg-white/80'
      } ${className}`}
    >
      {/* Left side - Logo and title */}
      <div className="flex items-center" data-tauri-drag-region>
        {isMacOS && <div className="w-[70px]" data-tauri-drag-region />}

        <div className="flex items-center gap-3 px-4" data-tauri-drag-region>
          <Logo size={26} />
          <div className="flex items-center gap-2.5" data-tauri-drag-region>
            <span className={`text-sm font-semibold tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`} data-tauri-drag-region>
              ORI-SSHManager
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              isDark
                ? 'bg-zinc-800 text-zinc-400'
                : 'bg-zinc-200 text-zinc-500'
            }`}>
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
          className={`p-2 rounded-lg transition-colors ${
            isDark
              ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'
          }`}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </motion.button>

        {!isMacOS && (
          <div className="flex items-center ml-2 gap-0.5">
            <motion.button
              whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMinimize}
              className={`p-2 rounded transition-colors ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Minimize"
            >
              <Minus className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMaximize}
              className={`p-2 rounded transition-colors ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'
              }`}
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
              className={`p-2 rounded transition-colors ${
                isDark ? 'text-zinc-400' : 'text-zinc-500'
              } hover:text-red-400`}
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
