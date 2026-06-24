# NexsusAudio Android — Design Document

## Brand & Color Palette

| Token | Light | Dark |
|-------|-------|------|
| primary | #6C63FF | #7C73FF |
| background | #F8F9FA | #0D0D0F |
| surface | #FFFFFF | #1A1A2E |
| foreground | #1A1A2E | #E8E8F0 |
| muted | #6B7280 | #9CA3AF |
| border | #E5E7EB | #2D2D4A |
| accent | #FF6584 | #FF6584 |
| success | #22C55E | #4ADE80 |
| warning | #F59E0B | #FBBF24 |
| error | #EF4444 | #F87171 |

## Screen List

1. **Downloader Tab** — Search Spotify URL / track name, fetch track list, queue downloads via YouTube audio
2. **Tag Editor Tab** — Browse downloaded files, edit ID3/metadata tags inline, bulk rename, MusicBrainz lookup
3. **P2P Search Tab** — Soulseek-compatible search via slskd REST API, browse results, initiate downloads
4. **Player Screen** — Now-playing overlay with playback controls, progress bar, album art
5. **Settings Tab** — Download folder, audio format/quality, Soulseek credentials, theme selector, API keys

## Key User Flows

### Download Flow
1. User enters Spotify URL or search query in Downloader tab
2. App fetches track list via Spotify scraper / YouTube search
3. User selects tracks → taps Download
4. Background download queue runs with progress notification
5. Files saved to Android Downloads folder

### Tag Edit Flow
1. User opens Tag Editor tab → sees list of downloaded files
2. Taps a file → inline edit fields appear
3. User edits title/artist/album/genre → taps Save
4. Optional: MusicBrainz lookup auto-fills tags

### P2P Flow
1. User opens P2P tab → enters search query
2. App queries slskd REST API for results
3. Results list shows filename, size, bitrate
4. User taps result → download added to queue

### Playback Flow
1. User taps any downloaded file
2. Mini-player appears at bottom of screen
3. Tap mini-player → full-screen Now Playing
4. Android media notification shows controls

## Layout Architecture

- **Bottom Tab Bar**: Downloader | Tag Editor | P2P | Settings
- **Mini Player**: Persistent bottom bar above tab bar when audio is playing
- **Full Player**: Modal sheet that slides up from mini player
- **Download Queue**: Slide-up sheet from Downloader tab
