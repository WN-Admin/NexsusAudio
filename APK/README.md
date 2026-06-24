# NexsusAudio Android APK

This folder contains build instructions and resources for creating the NexsusAudio Android APK.

## Files

- **BUILD_INSTRUCTIONS.md** - Complete guide for building the APK locally or in the cloud
- **app-release.apk** - (Will be placed here after building)

## Quick Start

### Option 1: Local Build (Fastest)
```bash
cd ../Android_Port
pnpm install
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
# APK will be at: android/app/build/outputs/apk/release/app-release.apk
```

### Option 2: Expo Cloud Build (Easiest)
```bash
cd ../Android_Port
eas login
eas build --platform android --type apk
# Download from https://expo.dev/builds
```

### Option 3: Manus UI (Most Convenient)
1. Open NexsusAudio in Manus
2. Click "Publish" button
3. Select Android
4. Download APK

## Build Details

- **Minimum Android:** 7.0 (API 24)
- **Target Android:** 15 (API 36)
- **Architectures:** ARM64, ARMv7
- **Size:** ~150-200 MB (estimated)

## Installation

1. Transfer APK to Android device
2. Enable "Unknown sources" in Settings
3. Open file manager and tap APK
4. Tap "Install"

Or use Android Studio emulator for testing.

## Features Included

✅ Spotify/YouTube downloader
✅ Audio tag editor with MusicBrainz lookup
✅ Soulseek P2P search
✅ Audio player with notifications
✅ Settings with theme support
✅ Android media controls
✅ Background playback

## Support

For build issues, see BUILD_INSTRUCTIONS.md troubleshooting section.

