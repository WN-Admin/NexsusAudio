"""
NexusAudio Downloader Module
Fully integrated Spotify + YouTube downloader with metadata/lyrics, queue, and cancellation
"""
import os
import re
import sys
import json
import base64
import logging
import threading
from collections import deque
import requests
from yt_dlp import YoutubeDL

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config
from core.metadata import fetch_lyrics, embed_lyrics

logger = logging.getLogger(__name__)


class DownloadCancelledError(Exception):
    """Raised inside yt-dlp hooks to abort cleanly on user cancel."""


_FORBIDDEN_CHARS_RE = re.compile(r'[/\\<>:"|?*\x00-\x1f]')


def _sanitize_filename(text, max_length=200):
    """Strip only filesystem-illegal characters, preserve international text."""
    cleaned = _FORBIDDEN_CHARS_RE.sub('', text).strip()
    if not cleaned:
        cleaned = 'Unknown'
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned


class Downloader:
    """Integrated downloader combining Spotify API and YouTube downloading"""

    def __init__(self, progress_callback=None, status_callback=None, queue_progress_callback=None):
        self.progress_callback = progress_callback
        self.status_callback = status_callback
        self.queue_progress_callback = queue_progress_callback
        self.sp = None
        self.active_downloads = {}
        self._cancel_event = threading.Event()
        self._queue = deque()
        self._queue_lock = threading.Lock()
        self._queue_thread = None
        self._queue_running = False
        self._current_track_index = 0
        self._total_queue_items = 0
        self._setup_spotify()

    def _setup_spotify(self):
        """Initialize Spotify API client using secured credentials (optional dep)"""
        try:
            import spotipy
            from spotipy.oauth2 import SpotifyClientCredentials
        except ImportError:
            logger.info("spotipy not installed — using web scraping fallback")
            return
        try:
            client_id, client_secret = config.get_spotify_creds()
            if client_id and client_secret:
                self.sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
                    client_id=client_id,
                    client_secret=client_secret
                ))
        except Exception as e:
            logger.warning("Spotify setup error: %s", e)
            if self.status_callback:
                self.status_callback(f"Spotify setup error: {e}")

    def cancel(self):
        """Cancel the current download operation"""
        self._cancel_event.set()
        logger.info("Download cancellation requested")

    def cancel_all(self):
        """Cancel current download and clear the queue"""
        self.cancel()
        with self._queue_lock:
            self._queue = deque()
            self._queue_running = False
        logger.info("All downloads cancelled and queue cleared")

    def reset_cancel(self):
        """Reset the cancel flag for a new download"""
        self._cancel_event.clear()

    def get_queue_length(self):
        """Return number of pending items in the queue"""
        with self._queue_lock:
            return len(self._queue)

    def get_queue(self):
        """Return a copy of the current queue"""
        with self._queue_lock:
            return list(self._queue) if self._queue else []

    def search_youtube(self, query, limit=5):
        """Search YouTube and return video URLs"""
        if self._cancel_event.is_set():
            return []
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True
            }
            with YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
                if result and 'entries' in result:
                    urls = []
                    for entry in result['entries']:
                        if entry is None:
                            continue
                        vid = entry.get('id') or entry.get('url')
                        if vid:
                            urls.append(f"https://www.youtube.com/watch?v={vid}")
                    return urls
        except Exception as e:
            logger.warning("YouTube search error: %s", e)
            if self.status_callback:
                self.status_callback(f"YouTube search error: {e}")
        return []

    def search_spotify(self, query, limit=10):
        """Search Spotify for tracks"""
        if not self.sp:
            return []
        if self._cancel_event.is_set():
            return []
        try:
            results = self.sp.search(q=query, limit=limit, type='track')
            tracks = []
            for item in results['tracks']['items']:
                tracks.append({
                    'name': item['name'],
                    'artist': item['artists'][0]['name'],
                    'album': item['album']['name'],
                    'duration_ms': item['duration_ms'],
                    'spotify_url': item['external_urls']['spotify']
                })
            return tracks
        except Exception as e:
            logger.warning("Spotify search error: %s", e)
            if self.status_callback:
                self.status_callback(f"Spotify search error: {e}")
            return []

    def _scrape_spotify_url(self, url):
        """Scrape track list from a Spotify playlist/track page (no API key needed).

        Returns list of {name, artist, album} dicts or [] on failure.
        """
        tracks = []
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            match = re.search(r'\"initialState\"[^>]*>(.*?)</', resp.text)
            if not match:
                logger.warning("No initialState found in Spotify page")
                return []
            decoded = base64.b64decode(match.group(1)).decode('utf-8')
            data = json.loads(decoded)
            entities = data.get('entities', {}).get('items', {})
            for uri, entity in entities.items():
                if entity.get('__typename') == 'Track':
                    t = entity
                    artist_names = []
                    if 'artists' in t:
                        artist_names = [a['profile']['name'] for a in t['artists'].get('items', [])]
                    elif 'firstArtist' in t:
                        artist_names = [a['profile']['name'] for a in t['firstArtist'].get('items', [])]
                    for a in t.get('otherArtists', {}).get('items', []):
                        artist_names.append(a['profile']['name'])
                    tracks.append({
                        'name': t['name'],
                        'artist': ', '.join(artist_names),
                        'album': t['albumOfTrack']['name'],
                    })
                elif entity.get('__typename') == 'Playlist':
                    items = entity.get('content', {}).get('items', [])
                    for item in items:
                        wrapper = item.get('itemV2', {}).get('data', {})
                        if wrapper.get('__typename') != 'Track':
                            continue
                        artist_names = []
                        if 'artists' in wrapper:
                            artist_names = [a['profile']['name'] for a in wrapper['artists'].get('items', [])]
                        elif 'firstArtist' in wrapper:
                            artist_names = [a['profile']['name'] for a in wrapper['firstArtist'].get('items', [])]
                        for a in wrapper.get('otherArtists', {}).get('items', []):
                            artist_names.append(a['profile']['name'])
                        tracks.append({
                            'name': wrapper['name'],
                            'artist': ', '.join(artist_names),
                            'album': wrapper['albumOfTrack']['name'],
                        })
        except Exception as e:
            logger.warning("Spotify scrape error: %s", e)
        return tracks

    def get_tracks_from_url(self, url):
        """Extract tracks from Spotify URL (track or playlist).

        Tries spotipy first if credentials are available, then falls back
        to scraping the public Spotify page.
        """
        tracks = []
        if self.sp:
            try:
                if 'track' in url:
                    track = self.sp.track(url)
                    tracks.append({
                        'name': track['name'],
                        'artist': track['artists'][0]['name'],
                        'album': track['album']['name']
                    })
                elif 'playlist' in url:
                    results = self.sp.playlist_tracks(url)
                    while results:
                        for item in results['items']:
                            track = item['track']
                            tracks.append({
                                'name': track['name'],
                                'artist': track['artists'][0]['name'],
                                'album': track['album']['name']
                            })
                        results = self.sp.next(results) if results['next'] else None
            except Exception as e:
                logger.warning("Spotify API error, falling back to scrape: %s", e)
                tracks = []
        if not tracks:
            tracks = self._scrape_spotify_url(url)
            if tracks:
                logger.info("Scraped %d tracks from Spotify page", len(tracks))
        if not tracks:
            err = "Could not fetch tracks from Spotify URL"
            logger.warning(err)
            if self.status_callback:
                self.status_callback(err)
        return tracks

    def download_track(self, track_info, output_dir, audio_format='mp3', quality='192', cookies=None, embed_metadata=True, embed_lyrics=False):
        """Download a single track from YouTube based on Spotify metadata.
        Tries multiple YouTube results on failure."""
        query = f"{track_info['name']} {track_info['artist']}"

        if self._cancel_event.is_set():
            return False, "Cancelled"

        urls = self.search_youtube(query, limit=5)

        if not urls:
            return False, f"Not found on YouTube: {query}"

        if self._cancel_event.is_set():
            return False, "Cancelled"

        safe_artist = _sanitize_filename(track_info['artist'])
        safe_title = _sanitize_filename(track_info['name'])
        filename = f"{safe_artist} - {safe_title}"
        outtmpl = os.path.join(output_dir, f'{filename}.%(ext)s')

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': outtmpl,
            'quiet': True,
            'no_warnings': True,
        }

        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': audio_format,
        }]
        if audio_format == 'mp3':
            ydl_opts['postprocessors'][0]['preferredquality'] = quality

        if cookies:
            if os.path.isfile(cookies):
                ydl_opts['cookiefile'] = cookies
            else:
                ydl_opts['cookiesfrombrowser'] = (cookies,)

        failed_urls = []
        for idx, video_url in enumerate(urls):
            if self._cancel_event.is_set():
                return False, "Cancelled"

            if idx > 0 and self.status_callback:
                self.status_callback(f"Trying result {idx + 1}/{len(urls)} for '{query}'")

            try:
                def progress_hook(d):
                    if self._cancel_event.is_set():
                        raise DownloadCancelledError()
                    if self.progress_callback:
                        if d['status'] == 'finished':
                            self.progress_callback(100)
                        elif d['status'] == 'downloading':
                            total = d.get('total_bytes') or d.get('total_bytes_estimate')
                            downloaded = d.get('downloaded_bytes')
                            if total and downloaded is not None:
                                self.progress_callback(min(99.0, downloaded / total * 100))
                            else:
                                p = d.get('_percent_str', '0%').replace('%', '')
                                try:
                                    self.progress_callback(float(p))
                                except (ValueError, TypeError):
                                    pass

                ydl_opts['progress_hooks'] = [progress_hook]

                with YoutubeDL(ydl_opts) as ydl:
                    ydl.download([video_url])

                if self._cancel_event.is_set():
                    return False, "Cancelled"

                if embed_metadata:
                    self._tag_file(output_dir, filename, track_info, audio_format)

                if self._cancel_event.is_set():
                    return False, "Cancelled"

                if embed_lyrics:
                    self._add_lyrics(output_dir, filename, track_info, audio_format)

                return True, "Downloaded successfully"

            except DownloadCancelledError:
                return False, "Cancelled"
            except Exception as e:
                err_str = str(e)
                failed_urls.append(video_url)
                logger.warning("Download failed for %s: %s", video_url, err_str)
                if self._cancel_event.is_set():
                    return False, "Cancelled"
                continue

        return False, f"All {len(urls)} YouTube results failed for '{query}': {failed_urls}"

    def _add_lyrics(self, output_dir, filename, track_info, audio_format='mp3'):
        """Fetch and embed lyrics"""
        lyrics = fetch_lyrics(track_info['name'], track_info['artist'])
        if lyrics:
            ext_map = {'mp3': '.mp3', 'flac': '.flac', 'm4a': '.m4a', 'ogg': '.ogg'}
            ext = ext_map.get(audio_format, '.mp3')
            filepath = os.path.join(output_dir, f"{filename}{ext}")
            if os.path.exists(filepath):
                embed_lyrics(filepath, lyrics)
                return True
        return False

    def _tag_file(self, output_dir, filename, track_info, audio_format):
        """Apply tags to downloaded file (supports MP3, FLAC, M4A, OGG)"""
        ext_map = {'mp3': '.mp3', 'flac': '.flac', 'm4a': '.m4a', 'ogg': '.ogg'}
        ext = ext_map.get(audio_format)
        if not ext:
            return
        filepath = os.path.join(output_dir, f"{filename}{ext}")

        if not os.path.exists(filepath):
            return

        try:
            if audio_format == 'mp3':
                from mutagen.easyid3 import EasyID3
                from mutagen.id3 import ID3NoHeaderError
                try:
                    audio = EasyID3(filepath)
                except ID3NoHeaderError:
                    audio = EasyID3()
                    audio.save(filepath)
                    audio = EasyID3(filepath)
                audio['title'] = track_info['name']
                audio['artist'] = track_info['artist']
                audio['album'] = track_info.get('album', '')
                audio.save()
            elif audio_format in ('flac', 'ogg'):
                from mutagen.flac import FLAC
                from mutagen.oggvorbis import OggVorbis
                if audio_format == 'flac':
                    audio = FLAC(filepath)
                else:
                    audio = OggVorbis(filepath)
                audio['title'] = track_info['name']
                audio['artist'] = track_info['artist']
                audio['album'] = track_info.get('album', '')
                audio.save()
            elif audio_format == 'm4a':
                from mutagen.mp4 import MP4
                audio = MP4(filepath)
                audio['\xa9nam'] = [track_info['name']]
                audio['\xa9ART'] = [track_info['artist']]
                audio['\xa9alb'] = [track_info.get('album', '')]
                audio.save()
        except Exception as e:
            logger.warning("Tagging error for %s: %s", filename, e)
            if self.status_callback:
                self.status_callback(f"Tagging error for {filename}: {e}")

    def queue_track(self, track_info, output_dir, audio_format='mp3', quality='192', cookies=None, embed_metadata=True, embed_lyrics=False):
        """Add a track to the download queue"""
        item = {
            'track_info': track_info,
            'output_dir': output_dir,
            'audio_format': audio_format,
            'quality': quality,
            'cookies': cookies,
            'embed_metadata': embed_metadata,
            'embed_lyrics': embed_lyrics,
        }
        with self._queue_lock:
            self._queue.append(item)
        logger.info("Queued track: %s - %s", track_info.get('artist', '?'), track_info.get('name', '?'))
        return len(self._queue)

    def process_queue(self):
        """Process the download queue in a background thread"""
        if self._queue_running:
            logger.warning("Queue already running")
            return

        with self._queue_lock:
            self._queue_running = True
            self._total_queue_items = len(self._queue)

        def _run_queue():
            self.reset_cancel()
            while True:
                with self._queue_lock:
                    if not self._queue or self._cancel_event.is_set():
                        self._queue_running = False
                        break
                    item = self._queue.popleft()
                    self._current_track_index = self._total_queue_items - len(self._queue)

                track = item['track_info']
                current = self._current_track_index
                total = self._total_queue_items

                if self.status_callback:
                    self.status_callback(f"[{current}/{total}] {track['name']} - {track['artist']}")

                if self.queue_progress_callback:
                    self.queue_progress_callback(current, total)

                success, msg = self.download_track(
                    track,
                    item['output_dir'],
                    item['audio_format'],
                    item['quality'],
                    item['cookies'],
                    item['embed_metadata'],
                    item['embed_lyrics'],
                )

                if not success and self.status_callback:
                    self.status_callback(f"Failed [{current}/{total}]: {msg}")

                if self._cancel_event.is_set():
                    with self._queue_lock:
                        self._queue.clear()
                        self._queue_running = False
                    return

            if self.status_callback:
                self.status_callback("Queue finished")

        self._queue_thread = threading.Thread(target=_run_queue, daemon=True)
        self._queue_thread.start()


