import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { colors, darkColors } from '../constants/theme';
import { cache } from '../storage/cache';
type Mode = 'system' | 'light' | 'dark';
const ThemeContext = createContext({ dark: false, palette: colors, mode: 'system' as Mode, setMode: (_mode: Mode) => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');
  useEffect(() => { let live = true; void cache.get<Mode>('appearance').then(saved => { if (live && (saved === 'light' || saved === 'dark')) setModeState(saved); }).catch(() => {}); return () => { live = false; }; }, []);
  const dark = mode === 'dark' || (mode === 'system' && scheme === 'dark');
  useEffect(() => { if (typeof document !== 'undefined') { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; } }, [dark]);
  const setMode = (next: Mode) => { setModeState(next); void cache.set('appearance', next).catch(() => {}); };
  return <ThemeContext.Provider value={{ dark, palette: dark ? darkColors : colors, mode, setMode }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
