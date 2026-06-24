# NexsusAudio Android Port

This directory contains the complete React Native / Expo mobile application port of NexsusAudio for Android.

## Structure

- **app/** - Expo Router navigation and screen components
- **components/** - Reusable React Native UI components
- **lib/** - Core business logic and services
  - `audio-player-context.tsx` - Global audio playback state
  - `download-context.tsx` - Download queue management
  - `settings-context.tsx` - App settings with AsyncStorage persistence
  - `spotify-service.ts` - Spotify/YouTube API integration
  - `slskd-service.ts` - Soulseek P2P REST API client
  - `file-service.ts` - Local file system access
- **assets/** - App icons, splash screens, images
- **app.config.ts** - Expo configuration with Android permissions and build settings
- **package.json** - Dependencies and build scripts

## Building for Android

### Prerequisites
- Node.js 18+ and pnpm
- Expo CLI: `npm install -g expo-cli`
- Android SDK (for local builds) or Expo cloud build

### Development
```bash
cd Android_Port
pnpm install
pnpm dev:metro
```

Then scan the QR code with Expo Go on your Android device.

### Production Build (APK)
```bash
cd Android_Port
eas build --platform android
```

Or use the Manus Management UI "Publish" button for cloud builds.

## Features

### 4 Main Tabs
1. **Downloader** - Fetch music from Spotify URLs or YouTube search
2. **Tag Editor** - Edit audio metadata with MusicBrainz lookup
3. **P2P Search** - Search Soulseek network via slskd REST API
4. **Settings** - Configure format, quality, API keys, themes

### Audio Player
- Mini-player bar (persistent above tab bar)
- Full-screen now playing modal
- Play/pause/skip controls
- Progress bar with seek
- Android media notifications with playback controls

### Android Integrations
- **Media Store** - Browse and manage downloaded audio files
- **Foreground Service** - Background audio playback
- **Media Notifications** - System-level playback controls
- **File System** - Direct access to app's document directory

## Desktop → Android Conversion

| Desktop (Python) | Android (React Native) |
|---|---|
| PyQt6 GUI | React Native + NativeWind CSS |
| yt-dlp + FFmpeg | Invidious/Piped REST API |
| spotipy | Spotify Web API + HTML scraping |
| mutagen | In-app tag editor + MusicBrainz API |
| Nicotine+ TCP | slskd REST API |
| System tray | Android foreground notification |
| File dialogs | expo-file-system |
| PyQt themes | NativeWind CSS variables + AsyncStorage |

## API Keys (Optional)

Configure in Settings tab:
- **Spotify Client ID/Secret** - For faster playlist resolution
- **slskd URL & API Key** - For P2P search (requires running slskd daemon)

Without API keys, the app uses:
- Direct YouTube audio stream URLs (no API needed)
- HTML scraping for Spotify (slower but works)
- P2P search disabled until slskd is configured

## Next Steps

- Add local music library tab (scan MediaStore)
- Integrate lyrics viewer with synced display
- Add share functionality (expo-sharing)
- Implement offline mode with local caching
- Add equalizer/audio effects
