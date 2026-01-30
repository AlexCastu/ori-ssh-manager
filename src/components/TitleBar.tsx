import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

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

  useEffect(() => {
    const platform = navigator.platform.toLowerCase();
    const isMac = platform.includes('mac');
    setIsMacOS(isMac);

    if (!isMac) return;

    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onResized(() => {});

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Don't render on Windows/Linux
  if (!isMacOS) {
    return null;
  }

  // Minimal title bar - just drag region for macOS traffic lights
  return (
    <div
      data-tauri-drag-region
      className={`h-7 flex items-center border-b backdrop-blur-xl select-none border-zinc-800/50 bg-zinc-900/80 ${className}`}
    >
      <div className="w-[70px]" data-tauri-drag-region />
      <div className="flex-1" data-tauri-drag-region />
    </div>
  );
}
