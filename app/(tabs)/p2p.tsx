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
  searchSlskd,
  downloadFromSlskd,
  checkSlskdConnection,
  formatFileSize,
  formatDuration,
  type SlskSearchResult,
} from '@/lib/slskd-service';

export default function P2PScreen() {
  const colors = useColors();
  const { settings } = useSettings();
  const { addToQueue } = useDownloadContext();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SlskSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'mp3' | 'flac' | 'm4a'>('all');

  const checkConnection = useCallback(async () => {
    if (!settings.slskdUrl || !settings.slskdApiKey) {
      setIsConnected(false);
      return false;
    }
    const ok = await checkSlskdConnection(settings.slskdUrl, settings.slskdApiKey);
    setIsConnected(ok);
    return ok;
  }, [settings]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    if (!settings.slskdUrl || !settings.slskdApiKey) {
      Alert.alert(
        'slskd Not Configured',
        'Please configure your slskd server URL and API key in Settings to use P2P search.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const connected = await checkConnection();
      if (!connected) {
        Alert.alert(
          'Connection Failed',
          'Could not connect to slskd. Check your server URL and API key in Settings.',
        );
        return;
      }

      const searchResults = await searchSlskd(settings.slskdUrl, settings.slskdApiKey, query);
      setResults(searchResults);

      if (searchResults.length === 0) {
        Alert.alert('No Results', 'No files found for your search query.');
      }
    } catch (err: any) {
      Alert.alert('Search Error', err?.message || 'An error occurred during search.');
    } finally {
      setIsSearching(false);
    }
  }, [query, settings, checkConnection]);

  const handleDownload = useCallback(async (item: SlskSearchResult) => {
    if (!settings.slskdUrl || !settings.slskdApiKey) return;

    const ok = await downloadFromSlskd(settings.slskdUrl, settings.slskdApiKey, {
      username: item.username,
      filename: item.filename,
      size: item.size,
    });

    if (ok) {
      Alert.alert('Download Queued', `"${item.filename.split('\\').pop()}" has been added to slskd download queue.`);
    } else {
      Alert.alert('Download Failed', 'Could not queue download. Check slskd connection.');
    }
  }, [settings]);

  const filteredResults = results.filter(r => {
    if (selectedFilter === 'all') return true;
    return r.extension?.toLowerCase() === selectedFilter || r.filename.toLowerCase().endsWith(`.${selectedFilter}`);
  });

  const renderResult = useCallback(({ item }: { item: SlskSearchResult }) => {
    const filename = item.filename.split('\\').pop() || item.filename;
    const ext = item.extension?.toLowerCase() || filename.split('.').pop()?.toLowerCase() || '';
    const extColor = {
      mp3: colors.primary,
      flac: colors.success,
      m4a: colors.warning,
      ogg: colors.warning,
    }[ext] || colors.muted;

    return (
      <View style={[styles.resultItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.resultMain}>
          <View style={styles.resultHeader}>
            <View style={[styles.extBadge, { backgroundColor: extColor + '20', borderColor: extColor + '40' }]}>
              <Text style={[styles.extText, { color: extColor }]}>{ext.toUpperCase()}</Text>
            </View>
            <Text style={[styles.resultFilename, { color: colors.foreground }]} numberOfLines={2}>
              {filename}
            </Text>
          </View>
          <View style={styles.resultMeta}>
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {formatFileSize(item.size)}
            </Text>
            {item.bitRate ? (
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {item.bitRate} kbps
              </Text>
            ) : null}
            {item.length ? (
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {formatDuration(item.length)}
              </Text>
            ) : null}
            <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
              {item.username}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => handleDownload(item)}
          style={({ pressed }) => [
            styles.downloadBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.8 },
          ]}
        >
          <IconSymbol name="arrow.down.to.line" size={18} color="#FFF" />
        </Pressable>
      </View>
    );
  }, [colors, handleDownload]);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <IconSymbol name="person.2.fill" size={24} color={colors.primary} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>P2P Search</Text>
          </View>
          <View style={styles.connectionStatus}>
            <View style={[
              styles.statusDot,
              { backgroundColor: isConnected === null ? colors.muted : isConnected ? colors.success : colors.error }
            ]} />
            <Text style={[styles.statusText, { color: colors.muted }]}>
              {isConnected === null ? 'slskd' : isConnected ? 'Connected' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* slskd notice if not configured */}
        {(!settings.slskdUrl || !settings.slskdApiKey) && (
          <View style={[styles.noticeBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
            <IconSymbol name="info.circle" size={16} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.warning }]}>
              Configure slskd URL & API key in Settings to enable P2P search
            </Text>
          </View>
        )}

        {/* Search Input */}
        <View style={[styles.searchSection, { borderBottomColor: colors.border }]}>
          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search for music..."
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <IconSymbol name="xmark.circle.fill" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={handleSearch}
            disabled={isSearching || !query.trim()}
            style={({ pressed }) => [
              styles.searchBtn,
              { backgroundColor: colors.primary },
              (isSearching || !query.trim()) && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.searchBtnText}>Search</Text>
            )}
          </Pressable>
        </View>

        {/* Format Filter */}
        {results.length > 0 && (
          <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
            {(['all', 'mp3', 'flac', 'm4a'] as const).map(f => (
              <Pressable
                key={f}
                onPress={() => setSelectedFilter(f)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selectedFilter === f ? colors.primary : colors.surface,
                    borderColor: selectedFilter === f ? colors.primary : colors.border,
                  }
                ]}
              >
                <Text style={[
                  styles.filterText,
                  { color: selectedFilter === f ? '#FFF' : colors.muted }
                ]}>
                  {f.toUpperCase()}
                </Text>
              </Pressable>
            ))}
            <Text style={[styles.resultCount, { color: colors.muted }]}>
              {filteredResults.length} results
            </Text>
          </View>
        )}

        {/* Results */}
        {isSearching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.searchingText, { color: colors.muted }]}>
              Searching Soulseek network...
            </Text>
          </View>
        ) : filteredResults.length > 0 ? (
          <FlatList
            data={filteredResults}
            keyExtractor={(item, i) => `${item.username}_${item.filename}_${i}`}
            renderItem={renderResult}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : results.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="antenna.radiowaves.left.and.right" size={56} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Soulseek P2P
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Search the Soulseek network for music files shared by other users.
              {'\n\n'}Requires slskd server configured in Settings.
            </Text>
          </View>
        ) : (
          <View style={styles.center}>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              No {selectedFilter !== 'all' ? selectedFilter.toUpperCase() : ''} results
            </Text>
          </View>
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
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 18,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  searchBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  searchBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  resultCount: {
    marginLeft: 'auto',
    fontSize: 12,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  resultMain: {
    flex: 1,
    gap: 6,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  extBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 1,
  },
  extText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  resultFilename: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  resultMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 11,
    lineHeight: 16,
  },
  downloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  searchingText: {
    fontSize: 14,
    lineHeight: 20,
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
});
