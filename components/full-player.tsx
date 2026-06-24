import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { useColors } from '@/hooks/use-colors';
import { useAudioPlayerContext } from '@/lib/audio-player-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatTime } from '@/lib/file-service';

interface FullPlayerProps {
  onClose: () => void;
}

export function FullPlayer({ onClose }: FullPlayerProps) {
  const colors = useColors();
  const {
    currentTrack,
    isPlaying,
    position,
    duration,
    togglePlayPause,
    seekTo,
    skipNext,
    skipPrev,
    queue,
  } = useAudioPlayerContext();

  const handleSeek = useCallback((value: number) => {
    seekTo(value);
  }, [seekTo]);

  if (!currentTrack) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>
          No track playing
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
        >
          <IconSymbol name="chevron.down" size={28} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Now Playing</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Artwork */}
        <View style={[styles.artwork, { backgroundColor: colors.primary + '22' }]}>
          <IconSymbol name="music.note" size={80} color={colors.primary} />
        </View>

        {/* Track Info */}
        <View style={styles.trackInfo}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {currentTrack.title}
          </Text>
          <Text style={[styles.artist, { color: colors.muted }]} numberOfLines={1}>
            {currentTrack.artist || 'Unknown Artist'}
          </Text>
          {currentTrack.album ? (
            <Text style={[styles.album, { color: colors.muted }]} numberOfLines={1}>
              {currentTrack.album}
            </Text>
          ) : null}
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration || 1}
            value={position}
            onSlidingComplete={handleSeek}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: colors.muted }]}>{formatTime(position)}</Text>
            <Text style={[styles.timeText, { color: colors.muted }]}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable
            onPress={skipPrev}
            style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.6 }]}
          >
            <IconSymbol name="backward.fill" size={32} color={colors.foreground} />
          </Pressable>

          <Pressable
            onPress={togglePlayPause}
            style={({ pressed }) => [
              styles.playBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
            ]}
          >
            <IconSymbol
              name={isPlaying ? 'pause.fill' : 'play.fill'}
              size={36}
              color="#FFFFFF"
            />
          </Pressable>

          <Pressable
            onPress={skipNext}
            style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.6 }]}
          >
            <IconSymbol name="forward.fill" size={32} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Queue info */}
        {queue.length > 1 && (
          <View style={[styles.queueInfo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="list.bullet" size={16} color={colors.muted} />
            <Text style={[styles.queueText, { color: colors.muted }]}>
              {queue.length} tracks in queue
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  artwork: {
    width: 260,
    height: 260,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  trackInfo: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 6,
  },
  artist: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  album: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 2,
  },
  progressSection: {
    width: '100%',
    marginBottom: 24,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 32,
  },
  controlBtn: {
    padding: 8,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  queueText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
