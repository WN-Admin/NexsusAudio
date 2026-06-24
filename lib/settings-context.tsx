import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AudioFormat = 'mp3' | 'm4a' | 'ogg' | 'flac';
export type AudioQuality = '64' | '128' | '192' | '256' | '320';
export type AppTheme = 'nexus-dark' | 'nexus-light' | 'ocean' | 'midnight' | 'dracula';

export interface AppSettings {
  // Download
  downloadDir: string;
  audioFormat: AudioFormat;
  audioQuality: AudioQuality;
  embedMetadata: boolean;
  embedLyrics: boolean;
  // Spotify API
  spotifyClientId: string;
  spotifyClientSecret: string;
  // Soulseek / slskd
  slskdUrl: string;
  slskdApiKey: string;
  // UI
  theme: AppTheme;
  colorScheme: 'dark' | 'light' | 'system';
}

const DEFAULTS: AppSettings = {
  downloadDir: 'downloads',
  audioFormat: 'mp3',
  audioQuality: '192',
  embedMetadata: true,
  embedLyrics: true,
  spotifyClientId: '',
  spotifyClientSecret: '',
  slskdUrl: '',
  slskdApiKey: '',
  theme: 'nexus-dark',
  colorScheme: 'system',
};

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);
const STORAGE_KEY = '@nexsusaudio_settings';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULTS, ...parsed });
        }
      })
      .catch(console.warn);
  }, []);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [settings]);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULTS);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
