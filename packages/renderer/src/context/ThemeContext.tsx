import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const KEY = 'app.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const getSystemTheme = (): Theme =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  // Determine if a saved preference exists; always start in light and adjust after mount
  const initialSaved = ((): Theme | null => {
    const saved = (localStorage.getItem(KEY) as Theme) || null;
    return saved === 'light' || saved === 'dark' ? saved : null;
  })();

  const [theme, setThemeState] = useState<Theme>('light');
  const [hasUserPreference, setHasUserPreference] = useState<boolean>(!!initialSaved);
  // After first mount, if no explicit user preference, adopt system preference (may switch to dark)
  useEffect(() => {
    if (initialSaved) {
      setThemeState(initialSaved);
    } else {
      const sys = getSystemTheme();
      if (sys === 'dark') setThemeState('dark');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hasUserPreferenceRef = useRef(hasUserPreference);

  useEffect(() => {
    hasUserPreferenceRef.current = hasUserPreference;
  }, [hasUserPreference]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!hasUserPreferenceRef.current) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };
    if (media.addEventListener) media.addEventListener('change', handleChange);
    else media.addListener(handleChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', handleChange);
      else media.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (hasUserPreference) {
      localStorage.setItem(KEY, theme);
    } else {
      localStorage.removeItem(KEY);
    }
  }, [theme, hasUserPreference]);

  const setTheme: ThemeContextValue['setTheme'] = (t) => {
    setHasUserPreference(true);
    setThemeState(t);
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const value = useMemo<ThemeContextValue>(() => ({ theme, toggle, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
