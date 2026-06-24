import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAudioPlayerContext } from '@/lib/audio-player-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { formatTime } from '@/lib/file-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullPlayer } from './full-player';

export function MiniPlayer() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, position, duration, togglePlayPause, skipNext, skipPrev } =
    useAudioPlayerContext();
  const [showFullPlayer, setShowFullPlayer] = useState(false);

  if (!currentTrack) return null;

  const progress = duration > 0 ? position / duration : 0;

  return (
    <>
      <Pressable
        onPress={() => setShowFullPlayer(true)}
        style={[
          styles.container,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
          },
        ]}
      >
        {/* Progress bar at top */}
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: `${progress * 100}%` },
            ]}
          />
        </View>

        <View style={styles.content}>
          {/* Track info */}
          <View style={styles.trackInfo}>
            <View style={[styles.artworkPlaceholder, { backgroundColor: colors.primary + '33' }]}>
              <IconSymbol name="music.note" size={20} color={colors.primary} />
            </View>
            <View style={styles.textContainer}>
              <Text
                style={[styles.title, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {currentTrack.title}
              </Text>
              <Text
                style={[styles.artist, { color: colors.muted }]}
                numberOfLines={1}
              >
                {currentTrack.artist || 'Unknown Artist'}
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <Pressable
              onPress={(e) => { e.stopPropagation(); skipPrev(); }}
              style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.6 }]}
            >
              <IconSymbol name="backward.fill" size={22} color={colors.foreground} />
            </Pressable>

            <Pressable
              onPress={(e) => { e.stopPropagation(); togglePlayPause(); }}
              style={({ pressed }) => [
                styles.playBtn,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.8 },
              ]}
            >
              <IconSymbol
                name={isPlaying ? 'pause.fill' : 'play.fill'}
                size={22}
                color="#FFFFFF"
              />
            </Pressable>

            <Pressable
              onPress={(e) => { e.stopPropagation(); skipNext(); }}
              style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.6 }]}
            >
              <IconSymbol name="forward.fill" size={22} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      </Pressable>

      <Modal
        visible={showFullPlayer}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFullPlayer(false)}
      >
        <FullPlayer onClose={() => setShowFullPlayer(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  progressBar: {
    height: 2,
    borderRadius: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  artworkPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  artist: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlBtn: {
    padding: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
