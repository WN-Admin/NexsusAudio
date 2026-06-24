# NexusAudio Project Conventions

## Python Conventions
- **Format**: Python 3.10+, PyQt6 GUI framework
- **Audio tagging**: mutagen library (EasyID3/FLAC/MP4/OggVorbis)
- **Download engine**: yt-dlp with FFmpeg post-processing
- **API**: spotipy for Spotify, requests for lyrics.ovh

## Thread Safety
- All GUI updates must go through PyQt6 signals (`pyqtSignal`)
- Use `QThread` subclass for long-running operations (see `DownloadThread`)
- Never call `setText()`, `addItem()`, etc. from non-main threads
- Use signal `emit()` to marshal results to main thread

## Tag Handling
- Internal key `'year'` maps to format-specific keys (MP3 `date`, FLAC `date`, M4A `\xa9day`)
- Internal key `'tracknumber'` maps to format-specific keys
- OGG uses the same tag keys as FLAC (Vorbis Comments format)

## Error Handling
- Never use bare `except:` — always specify exception type
- Use `logging.getLogger(__name__)` for module-level logging
- Use `QMessageBox` for user-facing errors

## Settings Persistence
- Config saved to `config.py` by rewriting the file
- Env vars override config values at import time
- Spotify credentials embedded with env-based override

## Git Workflow
- Single `main`/`master` branch
- Commit messages: prefix with `fix:`, `feat:`, `chore:`, `refactor:`
