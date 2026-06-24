import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useSettings } from '@/lib/settings-context';
import { useDownloadContext } from '@/lib/download-context';
import {
  scrapeSpotifyUrl,
  searchYouTube,
  searchSpotifyApi,
  getAudioStreamUrl,
  type SpotifyTrack,
} from '@/lib/spotify-service';
import { sanitizeFilename } from '@/lib/file-service';

type TrackItem = SpotifyTrack & { selected: boolean; id: string };

export default function DownloaderScreen() {
  const colors = useColors();
  const { settings } = useSettings();
  const { addToQueue, queue, activeCount, cancelAll, clearCompleted } = useDownloadContext();

  const [inputUrl, setInputUrl] = useState('');
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const fetchTracks = useCallback(async () => {
    if (!inputUrl.trim()) return;
    setIsFetching(true);
    setTracks([]);

    try {
      let fetched: SpotifyTrack[] = [];

      if (inputUrl.includes('spotify.com')) {
        // Try Spotify API first if credentials available
        if (settings.spotifyClientId && settings.spotifyClientSecret) {
          // For single track/playlist URLs, extract query from URL
          const trackMatch = inputUrl.match(/track\/([A-Za-z0-9]+)/);
          const playlistMatch = inputUrl.match(/playlist\/([A-Za-z0-9]+)/);
          if (trackMatch || playlistMatch) {
            fetched = await scrapeSpotifyUrl(inputUrl);
          }
        } else {
          fetched = await scrapeSpotifyUrl(inputUrl);
        }
      } else {
        // Treat as search query — search YouTube directly
        const ytResults = await searchYouTube(inputUrl, 10);
        fetched = ytResults.map(r => ({
          name: r.title,
          artist: '',
          album: '',
        }));
      }

      if (fetched.length === 0) {
        Alert.alert('No tracks found', 'Could not find any tracks for this URL or query. Try a different search term.');
        return;
      }

      setTracks(fetched.map((t, i) => ({
        ...t,
        id: `track_${i}_${Date.now()}`,
        selected: true,
      })));
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch tracks. Please check your internet connection.');
    } finally {
      setIsFetching(false);
    }
  }, [inputUrl, settings]);

  const toggleTrack = useCallback((id: string) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, selected: !t.selected } : t));
  }, []);

  const selectAll = useCallback(() => {
    setTracks(prev => prev.map(t => ({ ...t, selected: true })));
  }, []);

  const selectNone = useCallback(() => {
    setTracks(prev => prev.map(t => ({ ...t, selected: false })));
  }, []);

  const startDownload = useCallback(async () => {
    const selected = tracks.filter(t => t.selected);
    if (selected.length === 0) {
      Alert.alert('No tracks selected', 'Please select at least one track to download.');
      return;
    }

    // For each selected track, search YouTube and get stream URL
    const downloadItems = await Promise.all(
      selected.map(async (track) => {
        const query = `${track.name} ${track.artist}`.trim();
        const ytResults = await searchYouTube(query, 1);
        const videoId = ytResults[0]?.videoId;
        let streamUrl = '';

        if (videoId) {
          streamUrl = await getAudioStreamUrl(videoId) || '';
        }

        const filename = sanitizeFilename(
          track.artist
            ? `${track.artist} - ${track.name}.${settings.audioFormat}`
            : `${track.name}.${settings.audioFormat}`
        );

        return {
          title: track.name,
          artist: track.artist,
          album: track.album,
          url: streamUrl,
          filename,
          format: settings.audioFormat,
        };
      })
    );

    const validItems = downloadItems.filter(i => i.url);
    const skipped = downloadItems.length - validItems.length;

    if (validItems.length === 0) {
      Alert.alert('No streams found', 'Could not find YouTube audio streams for the selected tracks.');
      return;
    }

    addToQueue(validItems);
    setShowQueue(true);

    if (skipped > 0) {
      Alert.alert('Partial success', `${validItems.length} tracks queued, ${skipped} could not be found on YouTube.`);
    }
  }, [tracks, settings, addToQueue]);

  const renderTrack = useCallback(({ item }: { item: TrackItem }) => (
    <Pressable
      onPress={() => toggleTrack(item.id)}
      style={({ pressed }) => [
        styles.trackItem,
        {
          backgroundColor: item.selected ? colors.primary + '15' : colors.surface,
          borderColor: item.selected ? colors.primary + '40' : colors.border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[
        styles.checkbox,
        {
          backgroundColor: item.selected ? colors.primary : 'transparent',
          borderColor: item.selected ? colors.primary : colors.border,
        }
      ]}>
        {item.selected && <IconSymbol name="checkmark" size={12} color="#FFF" />}
      </View>
      <View style={styles.trackText}>
        <Text style={[styles.trackTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.artist ? (
          <Text style={[styles.trackArtist, { color: colors.muted }]} numberOfLines={1}>
            {item.artist}{item.album ? ` · ${item.album}` : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  ), [colors, toggleTrack]);

  const renderQueueItem = useCallback(({ item }: { item: typeof queue[0] }) => {
    const statusColor = {
      pending: colors.muted,
      downloading: colors.primary,
      done: colors.success,
      error: colors.error,
      cancelled: colors.muted,
    }[item.status];

    const statusIcon = {
      pending: 'clock' as const,
      downloading: 'arrow.down.circle.fill' as const,
      done: 'checkmark.circle.fill' as const,
      error: 'exclamationmark.triangle.fill' as const,
      cancelled: 'xmark.circle.fill' as const,
    }[item.status];

    return (
      <View style={[styles.queueItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.queueItemLeft}>
          <IconSymbol name={statusIcon} size={18} color={statusColor} />
          <View style={styles.queueItemText}>
            <Text style={[styles.queueTitle, { color: colors.foreground }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.queueArtist, { color: colors.muted }]} numberOfLines={1}>
              {item.artist || 'Unknown'} · {item.status === 'downloading' ? `${item.progress}%` : item.status}
            </Text>
          </View>
        </View>
        {item.status === 'downloading' && (
          <View style={[styles.miniProgress, { backgroundColor: colors.border }]}>
            <View style={[styles.miniProgressFill, { backgroundColor: colors.primary, width: `${item.progress}%` }]} />
          </View>
        )}
      </View>
    );
  }, [colors]);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <IconSymbol name="arrow.down.circle.fill" size={24} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Downloader</Text>
          </View>
          <Pressable
            onPress={() => setShowQueue(!showQueue)}
            style={({ pressed }) => [styles.queueBtn, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="list.bullet" size={20} color={colors.primary} />
            {activeCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{activeCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {!showQueue ? (
          <>
            {/* Search Input */}
            <View style={[styles.inputSection, { borderBottomColor: colors.border }]}>
              <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Spotify URL or search query..."
                  placeholderTextColor={colors.muted}
                  value={inputUrl}
                  onChangeText={setInputUrl}
                  onSubmitEditing={fetchTracks}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {inputUrl.length > 0 && (
                  <Pressable onPress={() => setInputUrl('')}>
                    <IconSymbol name="xmark.circle.fill" size={18} color={colors.muted} />
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={fetchTracks}
                disabled={isFetching || !inputUrl.trim()}
                style={({ pressed }) => [
                  styles.fetchBtn,
                  { backgroundColor: colors.primary },
                  (isFetching || !inputUrl.trim()) && { opacity: 0.5 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                {isFetching ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.fetchBtnText}>Fetch</Text>
                )}
              </Pressable>
            </View>

            {/* Format info */}
            <View style={[styles.formatBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Text style={[styles.formatText, { color: colors.muted }]}>
                Format: <Text style={{ color: colors.primary, fontWeight: '600' }}>{settings.audioFormat.toUpperCase()}</Text>
                {'  '}Quality: <Text style={{ color: colors.primary, fontWeight: '600' }}>{settings.audioQuality} kbps</Text>
              </Text>
            </View>

            {/* Track List */}
            {tracks.length > 0 && (
              <>
                <View style={[styles.selectionBar, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.selectionCount, { color: colors.muted }]}>
                    {tracks.filter(t => t.selected).length} / {tracks.length} selected
                  </Text>
                  <View style={styles.selectionActions}>
                    <Pressable onPress={selectAll} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                      <Text style={[styles.selectionAction, { color: colors.primary }]}>All</Text>
                    </Pressable>
                    <Text style={{ color: colors.border }}>  |  </Text>
                    <Pressable onPress={selectNone} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                      <Text style={[styles.selectionAction, { color: colors.primary }]}>None</Text>
                    </Pressable>
                  </View>
                </View>

                <FlatList
                  data={tracks}
                  keyExtractor={item => item.id}
                  renderItem={renderTrack}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                />

                <View style={[styles.downloadBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                  <Pressable
                    onPress={startDownload}
                    style={({ pressed }) => [
                      styles.downloadBtn,
                      { backgroundColor: colors.primary },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <IconSymbol name="arrow.down.to.line" size={18} color="#FFF" />
                    <Text style={styles.downloadBtnText}>
                      Download {tracks.filter(t => t.selected).length} Track{tracks.filter(t => t.selected).length !== 1 ? 's' : ''}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {tracks.length === 0 && !isFetching && (
              <View style={styles.emptyState}>
                <IconSymbol name="arrow.down.circle.fill" size={56} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  Download Music
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  Enter a Spotify playlist/track URL or search for a song to get started
                </Text>
              </View>
            )}
          </>
        ) : (
          /* Download Queue View */
          <>
            <View style={[styles.queueHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setShowQueue(false)} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <IconSymbol name="chevron.left" size={24} color={colors.primary} />
              </Pressable>
              <Text style={[styles.queueHeaderTitle, { color: colors.foreground }]}>
                Download Queue ({queue.length})
              </Text>
              <Pressable onPress={clearCompleted} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                <Text style={[styles.clearBtn, { color: colors.primary }]}>Clear</Text>
              </Pressable>
            </View>

            {queue.length === 0 ? (
              <View style={styles.emptyState}>
                <IconSymbol name="checkmark.circle.fill" size={56} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Queue Empty</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  No downloads in progress
                </Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={queue}
                  keyExtractor={item => item.id}
                  renderItem={renderQueueItem}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                />
                {activeCount > 0 && (
                  <View style={[styles.downloadBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                    <Pressable
                      onPress={cancelAll}
                      style={({ pressed }) => [
                        styles.cancelAllBtn,
                        { backgroundColor: colors.error + '20', borderColor: colors.error },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <IconSymbol name="stop.fill" size={16} color={colors.error} />
                      <Text style={[styles.cancelAllText, { color: colors.error }]}>Cancel All</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  queueBtn: {
    padding: 4,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  inputSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  fetchBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  fetchBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  formatBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  formatText: {
    fontSize: 12,
    lineHeight: 18,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  selectionCount: {
    fontSize: 13,
    lineHeight: 18,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionAction: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackText: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  trackArtist: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  downloadBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  downloadBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  queueHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  clearBtn: {
    fontSize: 14,
    fontWeight: '600',
  },
  queueItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  queueItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  queueItemText: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  queueArtist: {
    fontSize: 12,
    lineHeight: 18,
  },
  miniProgress: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  cancelAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelAllText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
