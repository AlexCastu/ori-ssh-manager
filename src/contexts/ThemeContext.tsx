import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import type { AppTheme } from '../types';

interface ThemeContextType {
  themeMode: AppTheme;
  isDark: boolean;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Default theme when no context is available
    return {
      themeMode: 'dark' as AppTheme,
      isDark: true,
      setTheme: () => {},
    };
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const themeMode = settings?.appTheme || 'dark';

  // Track system preference
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Determine if we're in dark mode
  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemPrefersDark;
    }
    return themeMode === 'dark';
  }, [themeMode, systemPrefersDark]);

  const setTheme = (theme: AppTheme) => {
    updateSettings({ appTheme: theme });
  };

  const themeValue = useMemo(() => ({
    themeMode,
    isDark,
    setTheme,
  }), [themeMode, isDark]);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;

    // Apply dark/light class
    root.classList.remove('dark', 'light');
    root.classList.add(isDark ? 'dark' : 'light');

    // Update body background for smooth transitions
    document.body.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
}
