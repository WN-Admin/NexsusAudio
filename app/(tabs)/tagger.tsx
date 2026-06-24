import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useAudioPlayerContext } from '@/lib/audio-player-context';
import {
  listDownloadedFiles,
  deleteFile,
  renameToArtistTitle,
  formatBytes,
  type AudioFileMeta,
} from '@/lib/file-service';
import { searchMusicBrainz } from '@/lib/spotify-service';

export default function TaggerScreen() {
  const colors = useColors();
  const { playTrack } = useAudioPlayerContext();

  const [files, setFiles] = useState<AudioFileMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AudioFileMeta | null>(null);
  const [editedTags, setEditedTags] = useState<Partial<AudioFileMeta>>({});
  const [showEditor, setShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mbResults, setMbResults] = useState<any[]>([]);
  const [isMbSearching, setIsMbSearching] = useState(false);

  const loadFiles = useCallback(async () => {
    const result = await listDownloadedFiles();
    setFiles(result);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFiles();
    setRefreshing(false);
  }, [loadFiles]);

  const openEditor = useCallback((file: AudioFileMeta) => {
    setSelectedFile(file);
    setEditedTags({
      title: file.title,
      artist: file.artist,
      album: file.album,
      genre: file.genre,
      year: file.year,
      trackNumber: file.trackNumber,
    });
    setMbResults([]);
    setSearchQuery(`${file.artist} ${file.title}`.trim());
    setShowEditor(true);
  }, []);

  const saveTagsLocally = useCallback(() => {
    if (!selectedFile) return;
    // Update local state (in production this would write tags via native module)
    setFiles(prev => prev.map(f =>
      f.uri === selectedFile.uri ? { ...f, ...editedTags } : f
    ));
    Alert.alert('Saved', 'Tags updated in app. Note: Writing tags to audio files requires a native module.');
    setShowEditor(false);
  }, [selectedFile, editedTags]);

  const handleDelete = useCallback((file: AudioFileMeta) => {
    Alert.alert(
      'Delete File',
      `Delete "${file.filename}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteFile(file.uri);
            if (ok) {
              setFiles(prev => prev.filter(f => f.uri !== file.uri));
            } else {
              Alert.alert('Error', 'Could not delete file.');
            }
          },
        },
      ]
    );
  }, []);

  const handleRename = useCallback(async (file: AudioFileMeta) => {
    if (!file.artist || !file.title) {
      Alert.alert('Missing tags', 'Please set artist and title before renaming.');
      return;
    }
    const newUri = await renameToArtistTitle(file.uri, file.artist, file.title);
    if (newUri) {
      setFiles(prev => prev.map(f =>
        f.uri === file.uri ? { ...f, uri: newUri, filename: newUri.split('/').pop() || f.filename } : f
      ));
      Alert.alert('Renamed', `File renamed to "${file.artist} - ${file.title}"`);
    } else {
      Alert.alert('Error', 'Could not rename file.');
    }
  }, []);

  const searchMusicBrainzHandler = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsMbSearching(true);
    const results = await searchMusicBrainz(searchQuery);
    setMbResults(results.slice(0, 8));
    setIsMbSearching(false);
  }, [searchQuery]);

  const applyMbResult = useCallback((release: any) => {
    setEditedTags(prev => ({
      ...prev,
      album: release.title || prev.album,
      artist: release['artist-credit']?.[0]?.artist?.name || prev.artist,
      year: release.date?.substring(0, 4) || prev.year,
    }));
    setMbResults([]);
  }, []);

  const filteredFiles = files.filter(f =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFile = useCallback(({ item }: { item: AudioFileMeta }) => (
    <View style={[styles.fileItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={() => playTrack({ id: item.uri, title: item.title || item.filename, artist: item.artist, album: item.album, uri: item.uri })}
        style={styles.fileMain}
      >
        <View style={[styles.fileIcon, { backgroundColor: colors.primary + '20' }]}>
          <IconSymbol name="music.note" size={20} color={colors.primary} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
            {item.title || item.filename}
          </Text>
          <Text style={[styles.fileArtist, { color: colors.muted }]} numberOfLines={1}>
            {item.artist || 'Unknown Artist'}{item.album ? ` · ${item.album}` : ''}
          </Text>
          <Text style={[styles.fileMeta, { color: colors.muted }]}>
            {item.format.toUpperCase()} · {formatBytes(item.size)}
          </Text>
        </View>
      </Pressable>

      <View style={styles.fileActions}>
        <Pressable
          onPress={() => openEditor(item)}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          <IconSymbol name="pencil" size={18} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => handleDelete(item)}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.6 }]}
        >
          <IconSymbol name="trash.fill" size={18} color={colors.error} />
        </Pressable>
      </View>
    </View>
  ), [colors, playTrack, openEditor, handleDelete]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <IconSymbol name="tag.fill" size={24} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Tag Editor</Text>
        </View>
        <Text style={[styles.fileCount, { color: colors.muted }]}>{files.length} files</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            style={[styles.searchText, { color: colors.foreground }]}
            placeholder="Search files..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredFiles.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="music.note" size={56} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Audio Files</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Download tracks using the Downloader tab to see them here
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={item => item.uri}
          renderItem={renderFile}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* Tag Editor Modal */}
      <Modal
        visible={showEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditor(false)}
      >
        <View style={[styles.editorContainer, { backgroundColor: colors.background }]}>
          {/* Editor Header */}
          <View style={[styles.editorHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowEditor(false)} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
              <Text style={[styles.editorCancel, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.editorTitle, { color: colors.foreground }]}>Edit Tags</Text>
            <Pressable onPress={saveTagsLocally} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
              <Text style={[styles.editorSave, { color: colors.primary }]}>Save</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editorContent}>
            {/* Filename */}
            {selectedFile && (
              <View style={[styles.filenameBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IconSymbol name="doc.fill" size={16} color={colors.muted} />
                <Text style={[styles.filenameText, { color: colors.muted }]} numberOfLines={2}>
                  {selectedFile.filename}
                </Text>
              </View>
            )}

            {/* Tag fields */}
            {[
              { key: 'title', label: 'Title', placeholder: 'Track title' },
              { key: 'artist', label: 'Artist', placeholder: 'Artist name' },
              { key: 'album', label: 'Album', placeholder: 'Album name' },
              { key: 'genre', label: 'Genre', placeholder: 'Genre' },
              { key: 'year', label: 'Year', placeholder: 'YYYY', keyboardType: 'numeric' as const },
              { key: 'trackNumber', label: 'Track #', placeholder: '1', keyboardType: 'numeric' as const },
            ].map(field => (
              <View key={field.key} style={styles.tagField}>
                <Text style={[styles.tagLabel, { color: colors.muted }]}>{field.label}</Text>
                <TextInput
                  style={[styles.tagInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.muted}
                  value={(editedTags as any)[field.key] || ''}
                  onChangeText={text => setEditedTags(prev => ({ ...prev, [field.key]: text }))}
                  keyboardType={field.keyboardType}
                  returnKeyType="next"
                />
              </View>
            ))}

            {/* Rename button */}
            {selectedFile && (
              <Pressable
                onPress={() => {
                  setShowEditor(false);
                  handleRename({ ...selectedFile, ...editedTags as AudioFileMeta });
                }}
                style={({ pressed }) => [
                  styles.renameBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <IconSymbol name="pencil" size={16} color={colors.primary} />
                <Text style={[styles.renameBtnText, { color: colors.primary }]}>
                  Rename to "Artist - Title"
                </Text>
              </Pressable>
            )}

            {/* MusicBrainz lookup */}
            <View style={[styles.mbSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.mbSectionTitle, { color: colors.foreground }]}>
                MusicBrainz Lookup
              </Text>
              <View style={styles.mbSearchRow}>
                <TextInput
                  style={[styles.mbInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Search artist / album..."
                  placeholderTextColor={colors.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  onSubmitEditing={searchMusicBrainzHandler}
                />
                <Pressable
                  onPress={searchMusicBrainzHandler}
                  disabled={isMbSearching}
                  style={({ pressed }) => [
                    styles.mbSearchBtn,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  {isMbSearching ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <IconSymbol name="magnifyingglass" size={18} color="#FFF" />
                  )}
                </Pressable>
              </View>

              {mbResults.map((r, i) => (
                <Pressable
                  key={i}
                  onPress={() => applyMbResult(r)}
                  style={({ pressed }) => [
                    styles.mbResult,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.mbResultTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={[styles.mbResultSub, { color: colors.muted }]} numberOfLines={1}>
                    {r['artist-credit']?.[0]?.artist?.name || ''} · {r.date?.substring(0, 4) || ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  fileCount: {
    fontSize: 13,
    lineHeight: 18,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  fileMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  fileArtist: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  fileMeta: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  fileActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    padding: 8,
  },
  editorContainer: {
    flex: 1,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  editorCancel: {
    fontSize: 16,
    lineHeight: 22,
  },
  editorTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  editorSave: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  editorContent: {
    padding: 16,
    gap: 12,
  },
  filenameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  filenameText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  tagField: {
    gap: 4,
  },
  tagLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  renameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  renameBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  mbSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 8,
  },
  mbSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  mbSearchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mbInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  mbSearchBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mbResult: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  mbResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  mbResultSub: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
});
