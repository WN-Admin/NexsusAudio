# NexsusAudio Android APK Build Instructions

## Option 1: Build Locally (Recommended for Development)

### Prerequisites
- Node.js 18+ and npm/pnpm
- Android SDK (API 24+)
- Java JDK 11+
- Gradle

### Steps

1. **Navigate to Android_Port directory:**
   ```bash
   cd Android_Port
   pnpm install
   ```

2. **Run Expo prebuild:**
   ```bash
   npx expo prebuild --platform android --clean
   ```

3. **Build APK:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

4. **Find the APK:**
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

---

## Option 2: Build with Expo Cloud (Recommended for Production)

### Prerequisites
- Expo account (free at https://expo.dev)
- EAS CLI: `npm install -g eas-cli`

### Steps

1. **Navigate to Android_Port:**
   ```bash
   cd Android_Port
   ```

2. **Authenticate with Expo:**
   ```bash
   eas login
   ```

3. **Build APK in cloud:**
   ```bash
   eas build --platform android --type apk
   ```

4. **Download APK:**
   - Visit https://expo.dev/builds to see your build
   - Download the APK when ready

---

## Option 3: Use Manus Management UI (Easiest)

1. Open the NexsusAudio project in Manus
2. Click the **Publish** button in the Management UI header
3. Select Android as the platform
4. The APK will be built and available for download

---

## Build Configuration

The build is configured in `Android_Port/app.config.ts`:

- **App Name:** NexsusAudio
- **Bundle ID:** space.manus.nexsusaudio.t20260624103906
- **Min SDK:** 24 (Android 7.0+)
- **Target SDK:** 36 (Android 15)
- **Architectures:** arm64-v8a, armeabi-v7a

### Android Permissions Included
- POST_NOTIFICATIONS (push notifications)
- INTERNET (network access)
- READ_EXTERNAL_STORAGE (file access)
- WRITE_EXTERNAL_STORAGE (file access)
- READ_MEDIA_AUDIO (audio library access)
- FOREGROUND_SERVICE (background audio playback)
- FOREGROUND_SERVICE_MEDIA_PLAYBACK (media controls)
- WAKE_LOCK (keep device awake during playback)

---

## Troubleshooting

### "SDK location not found"
Set `ANDROID_HOME` environment variable:
```bash
export ANDROID_HOME=/path/to/android/sdk
```

### "Gradle build failed"
Clear Gradle cache:
```bash
cd Android_Port/android
./gradlew clean
./gradlew assembleRelease
```

### "Out of memory"
Increase Gradle heap:
```bash
export GRADLE_OPTS="-Xmx2048m"
```

### "Module not found"
Reinstall dependencies:
```bash
cd Android_Port
rm -rf node_modules
pnpm install
```

---

## Testing the APK

### On Android Device
1. Enable "Unknown sources" in Settings
2. Transfer APK to device
3. Open file manager and tap the APK
4. Tap "Install"

### Using Android Emulator
```bash
adb install app-release.apk
```

### Using Android Studio
1. Open Android Studio
2. Device Manager → Create Virtual Device
3. Run the device
4. Drag & drop APK onto emulator

---

## App Features

- **Downloader Tab** - Fetch music from Spotify URLs or YouTube search
- **Tag Editor** - Edit audio metadata with MusicBrainz lookup
- **P2P Search** - Search Soulseek network via slskd REST API
- **Settings** - Configure format, quality, API keys, themes
- **Audio Player** - Mini-player + full-screen now playing with controls
- **Android Notifications** - System-level playback controls

---

## Next Steps

1. Build the APK using one of the methods above
2. Test on Android device or emulator
3. Report any issues to the development team
4. Configure API keys in Settings for optimal performance

