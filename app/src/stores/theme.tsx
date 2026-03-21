import { createContext, useContext, createSignal, type JSX, type Component, onMount } from 'solid-js';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: () => Theme;
  setTheme: (theme: Theme) => void;
  isDark: () => boolean;
}

const ThemeContext = createContext<ThemeContextValue>();

export const ThemeProvider: Component<{ children: JSX.Element }> = (props) => {
  const [theme, setThemeState] = createSignal<Theme>(
    (localStorage.getItem('vb-theme') as Theme) || 'dark'
  );

  const isDark = () => {
    const t = theme();
    if (t === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return t === 'dark';
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('vb-theme', t);
    document.documentElement.classList.toggle('dark', isDark());
  };

  onMount(() => {
    document.documentElement.classList.toggle('dark', isDark());
  });

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {props.children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
