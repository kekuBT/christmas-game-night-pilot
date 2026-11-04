import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { everyday, themeToCssVars, type MchezoTheme } from './tokens/tokens';

interface Ctx {
  theme: MchezoTheme;
  reducedMotion: boolean;
  haptics: boolean;
}

const MchezoContext = createContext<Ctx>({ theme: everyday, reducedMotion: false, haptics: true });

function useSystemReducedMotion(): boolean {
  const [rm, setRm] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setRm(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return rm;
}

export interface MchezoProviderProps {
  theme?: MchezoTheme;
  /** Force reduced motion on/off (e.g. an in-app setting). Defaults to the OS preference. */
  reducedMotion?: boolean;
  haptics?: boolean;
  /** Render as a full-height phone surface (default) or a bare wrapper. */
  as?: 'surface' | 'bare';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Applies theme CSS variables and motion preference to everything inside. */
export function MchezoProvider({ theme = everyday, reducedMotion, haptics = true, as = 'surface', className, style, children }: MchezoProviderProps) {
  const sys = useSystemReducedMotion();
  const rm = reducedMotion ?? sys;
  const value = useMemo(() => ({ theme, reducedMotion: rm, haptics }), [theme, rm, haptics]);
  const vars = useMemo(() => themeToCssVars(theme) as CSSProperties, [theme]);
  return (
    <MchezoContext.Provider value={value}>
      <div
        className={['mz-root', as === 'surface' ? 'mz-surface' : '', className].filter(Boolean).join(' ')}
        data-mz-theme={theme.id}
        data-mz-motion={rm ? 'reduced' : 'full'}
        style={{ ...vars, ...style }}
      >
        {children}
      </div>
    </MchezoContext.Provider>
  );
}

export const useMchezo = () => useContext(MchezoContext);

export function useHaptics() {
  const { haptics } = useMchezo();
  return (pattern: number | number[]) => {
    if (!haptics) return;
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  };
}
