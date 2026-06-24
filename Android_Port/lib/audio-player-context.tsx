import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  uri: string;
  artwork?: string;
  duration?: number;
}

interface AudioPlayerState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
}

interface AudioPlayerContextValue extends AudioPlayerState {
  playTrack: (track: Track) => Promise<void>;
  playQueue: (tracks: Track[], startIndex?: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  addToQueue: (track: Track) => void;
  clearQueue: () => void;
  playerRef: React.MutableRefObject<AudioPlayer | null>;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    queue: [],
    isPlaying: false,
    position: 0,
    duration: 0,
    isLoading: false,
  });
  const queueIndexRef = useRef(0);
  const positionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Configure audio mode for background playback
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(console.warn);

    // Setup Android notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('playback', {
        name: 'Now Playing',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        vibrationPattern: null,
        enableVibrate: false,
      }).catch(console.warn);
    }

    return () => {
      if (positionInterval.current) clearInterval(positionInterval.current);
      playerRef.current?.remove();
    };
  }, []);

  const startPositionTracking = useCallback(() => {
    if (positionInterval.current) clearInterval(positionInterval.current);
    positionInterval.current = setInterval(() => {
      const p = playerRef.current;
      if (p) {
        setState(prev => ({
          ...prev,
          position: p.currentTime ?? 0,
          duration: p.duration ?? 0,
        }));
      }
    }, 500);
  }, []);

  const stopPositionTracking = useCallback(() => {
    if (positionInterval.current) {
      clearInterval(positionInterval.current);
      positionInterval.current = null;
    }
  }, []);

  const updateNotification = useCallback(async (track: Track, playing: boolean) => {
    if (Platform.OS !== 'android') return;
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: track.title,
          body: `${track.artist} — ${track.album}`,
          data: { type: 'playback' },
          sticky: true,
        },
        trigger: null,
      });
    } catch {
      // Notification permission not granted — silently skip
    }
  }, []);

  const playTrack = useCallback(async (track: Track) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // Clean up previous player
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
      stopPositionTracking();

      const player = createAudioPlayer({ uri: track.uri });
      playerRef.current = player;

      player.play();

      setState(prev => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        isLoading: false,
        position: 0,
        duration: 0,
      }));

      startPositionTracking();
      updateNotification(track, true);
    } catch (err) {
      console.error('playTrack error:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [startPositionTracking, stopPositionTracking, updateNotification]);

  const playQueue = useCallback(async (tracks: Track[], startIndex = 0) => {
    queueIndexRef.current = startIndex;
    setState(prev => ({ ...prev, queue: tracks }));
    if (tracks.length > 0) {
      await playTrack(tracks[startIndex]);
    }
  }, [playTrack]);

  const pause = useCallback(() => {
    playerRef.current?.pause();
    stopPositionTracking();
    setState(prev => ({ ...prev, isPlaying: false }));
  }, [stopPositionTracking]);

  const resume = useCallback(() => {
    playerRef.current?.play();
    startPositionTracking();
    setState(prev => ({ ...prev, isPlaying: true }));
  }, [startPositionTracking]);

  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) pause();
    else resume();
  }, [state.isPlaying, pause, resume]);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
    setState(prev => ({ ...prev, position: seconds }));
  }, []);

  const skipNext = useCallback(async () => {
    const { queue } = state;
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx < queue.length) {
      queueIndexRef.current = nextIdx;
      await playTrack(queue[nextIdx]);
    }
  }, [state, playTrack]);

  const skipPrev = useCallback(async () => {
    const { queue } = state;
    const prevIdx = queueIndexRef.current - 1;
    if (prevIdx >= 0) {
      queueIndexRef.current = prevIdx;
      await playTrack(queue[prevIdx]);
    } else {
      seekTo(0);
    }
  }, [state, playTrack, seekTo]);

  const addToQueue = useCallback((track: Track) => {
    setState(prev => ({ ...prev, queue: [...prev.queue, track] }));
  }, []);

  const clearQueue = useCallback(() => {
    setState(prev => ({ ...prev, queue: [] }));
    queueIndexRef.current = 0;
  }, []);

  return (
    <AudioPlayerContext.Provider value={{
      ...state,
      playTrack,
      playQueue,
      pause,
      resume,
      togglePlayPause,
      seekTo,
      skipNext,
      skipPrev,
      addToQueue,
      clearQueue,
      playerRef,
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerContext() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayerContext must be used within AudioPlayerProvider');
  return ctx;
}
