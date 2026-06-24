import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useSettings, type AudioFormat, type AudioQuality, type AppTheme } from '@/lib/settings-context';
import { useThemeContext } from '@/lib/theme-provider';

const FORMATS: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'ogg', label: 'OGG' },
  { value: 'flac', label: 'FLAC' },
];

const QUALITIES: { value: AudioQuality; label: string }[] = [
  { value: '64', label: '64 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '192', label: '192 kbps' },
  { value: '256', label: '256 kbps' },
  { value: '320', label: '320 kbps' },
];

const THEMES: { value: AppTheme; label: string; dark: boolean }[] = [
  { value: 'nexus-dark', label: 'Nexus Dark', dark: true },
  { value: 'nexus-light', label: 'Nexus Light', dark: false },
  { value: 'ocean', label: 'Ocean', dark: true },
  { value: 'midnight', label: 'Midnight', dark: true },
  { value: 'dracula', label: 'Dracula', dark: true },
];

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <IconSymbol name={icon as any} size={18} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.settingControl}>{children}</View>
    </View>
  );
}

function ChipSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[
            styles.chip,
            {
              backgroundColor: value === opt.value ? colors.primary : colors.surface,
              borderColor: value === opt.value ? colors.primary : colors.border,
            },
          ]}
        >
          <Text style={[styles.chipText, { color: value === opt.value ? '#FFF' : colors.muted }]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { colorScheme, setColorScheme } = useThemeContext();

  const [showSpotifySecret, setShowSpotifySecret] = useState(false);
  const [showSlskdKey, setShowSlskdKey] = useState(false);

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'Reset all settings to defaults? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetSettings(),
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconSymbol name="gearshape.fill" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Download Settings */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SectionHeader title="Download" icon="arrow.down.circle.fill" />

          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Audio Format</Text>
            <ChipSelector
              options={FORMATS}
              value={settings.audioFormat}
              onChange={v => updateSettings({ audioFormat: v })}
            />
          </View>

          <View style={[styles.settingBlock, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Quality</Text>
            <ChipSelector
              options={QUALITIES}
              value={settings.audioQuality}
              onChange={v => updateSettings({ audioQuality: v })}
            />
          </View>

          <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>Embed Metadata</Text>
              <Text style={[styles.settingHint, { color: colors.muted }]}>Auto-tag downloaded files</Text>
            </View>
            <Switch
              value={settings.embedMetadata}
              onValueChange={v => updateSettings({ embedMetadata: v })}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={settings.embedMetadata ? colors.primary : colors.muted}
            />
          </View>

          <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>Embed Lyrics</Text>
              <Text style={[styles.settingHint, { color: colors.muted }]}>Fetch & embed lyrics automatically</Text>
            </View>
            <Switch
              value={settings.embedLyrics}
              onValueChange={v => updateSettings({ embedLyrics: v })}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={settings.embedLyrics ? colors.primary : colors.muted}
            />
          </View>
        </View>

        {/* Spotify API */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SectionHeader title="Spotify API (Optional)" icon="bolt.fill" />
          <Text style={[styles.sectionNote, { color: colors.muted }]}>
            Without API keys, Spotify URLs are scraped directly. Add keys for faster playlist resolution.
          </Text>

          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Client ID</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Spotify Client ID"
              placeholderTextColor={colors.muted}
              value={settings.spotifyClientId}
              onChangeText={v => updateSettings({ spotifyClientId: v })}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.settingBlock, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Client Secret</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.textInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Spotify Client Secret"
                placeholderTextColor={colors.muted}
                value={settings.spotifyClientSecret}
                onChangeText={v => updateSettings({ spotifyClientSecret: v })}
                secureTextEntry={!showSpotifySecret}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => setShowSpotifySecret(!showSpotifySecret)}
                style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.6 }]}
              >
                <IconSymbol name={showSpotifySecret ? 'eye.slash' : 'eye'} size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* slskd P2P */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SectionHeader title="Soulseek (slskd)" icon="antenna.radiowaves.left.and.right" />
          <Text style={[styles.sectionNote, { color: colors.muted }]}>
            Run slskd on your home server or NAS. Get it at github.com/slskd/slskd
          </Text>

          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Server URL</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="http://192.168.1.x:5030"
              placeholderTextColor={colors.muted}
              value={settings.slskdUrl}
              onChangeText={v => updateSettings({ slskdUrl: v })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={[styles.settingBlock, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>API Key</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.textInput, { flex: 1, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="slskd API key"
                placeholderTextColor={colors.muted}
                value={settings.slskdApiKey}
                onChangeText={v => updateSettings({ slskdApiKey: v })}
                secureTextEntry={!showSlskdKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => setShowSlskdKey(!showSlskdKey)}
                style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.6 }]}
              >
                <IconSymbol name={showSlskdKey ? 'eye.slash' : 'eye'} size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Appearance */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SectionHeader title="Appearance" icon="paintbrush.fill" />

          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Color Scheme</Text>
            <ChipSelector
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
              value={colorScheme === 'dark' ? 'dark' : colorScheme === 'light' ? 'light' : 'system'}
              onChange={v => {
                if (v === 'dark' || v === 'light') setColorScheme(v);
                updateSettings({ colorScheme: v as any });
              }}
            />
          </View>

          <View style={[styles.settingBlock, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Theme</Text>
            <View style={styles.themeGrid}>
              {THEMES.map(t => (
                <Pressable
                  key={t.value}
                  onPress={() => updateSettings({ theme: t.value })}
                  style={[
                    styles.themeChip,
                    {
                      backgroundColor: settings.theme === t.value ? colors.primary + '20' : colors.background,
                      borderColor: settings.theme === t.value ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.themeDot, { backgroundColor: t.dark ? '#1A1A2E' : '#F8F9FA', borderColor: colors.border }]} />
                  <Text style={[styles.themeLabel, { color: settings.theme === t.value ? colors.primary : colors.foreground }]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* About */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SectionHeader title="About" icon="info.circle" />
          <View style={styles.aboutContent}>
            <Text style={[styles.appName, { color: colors.foreground }]}>NexsusAudio</Text>
            <Text style={[styles.appVersion, { color: colors.muted }]}>Version 1.0.0 · Android</Text>
            <Text style={[styles.aboutDesc, { color: colors.muted }]}>
              A mobile conversion of NexsusAudio — Spotify downloader, audio tag editor, and Soulseek P2P client.
            </Text>
            <Text style={[styles.aboutDesc, { color: colors.muted }]}>
              Original desktop app: github.com/WN-Admin/NexsusAudio
            </Text>
          </View>
        </View>

        {/* Reset */}
        <View style={styles.resetSection}>
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [
              styles.resetBtn,
              { borderColor: colors.error },
              pressed && { opacity: 0.7 },
            ]}
          >
            <IconSymbol name="arrow.clockwise" size={16} color={colors.error} />
            <Text style={[styles.resetText, { color: colors.error }]}>Reset to Defaults</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  sectionNote: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  settingBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  settingLabel: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  settingHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  settingControl: {
    flexShrink: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeBtn: {
    padding: 8,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  themeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  aboutContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  appVersion: {
    fontSize: 13,
    lineHeight: 20,
  },
  aboutDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  resetSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  resetText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
});
