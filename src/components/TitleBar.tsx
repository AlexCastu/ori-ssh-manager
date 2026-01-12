import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Logo } from './Logo';
import { useTheme } from '../contexts/ThemeContext';

// Helper to check platform
export function isMacOSPlatform(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().includes('mac');
  }
  return false;
}

interface TitleBarProps {
  className?: string;
}

export function TitleBar({ className = '' }: TitleBarProps) {
  const [isMacOS, setIsMacOS] = useState(false);
  const { isDark } = useTheme();

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    const isMac = platform.includes('mac');
    setIsMacOS(isMac);

    // On Windows/Linux, don't render this component at all
    if (!isMac) return;

    // Set up resize listener for macOS
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onResized(() => {
      // Keep listener for potential future use
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Don't render on Windows/Linux - they use native decorations
  if (!isMacOS) {
    return null;
  }

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

      {/* Right side - empty spacer for symmetry */}
      <div className="w-4" data-tauri-drag-region />
    </div>
  );
}
