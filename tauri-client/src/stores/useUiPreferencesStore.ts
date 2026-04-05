import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (lang: string) => void;
}

export const useUiPreferencesStore = create<UiPreferences>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'vibe-ui-preferences' },
  ),
);
