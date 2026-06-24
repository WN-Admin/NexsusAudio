/**
 * NexsusAudio — Spotify & YouTube Service (Android equivalent of core/downloader.py)
 *
 * Desktop: yt-dlp + FFmpeg + spotipy
 * Android: YouTube Data API v3 search + YouTube audio stream URL extraction via invidious/piped API
 */

export interface SpotifyTrack {
  name: string;
  artist: string;
  album: string;
  duration_ms?: number;
  spotify_url?: string;
}

export interface YouTubeResult {
  videoId: string;
  title: string;
  url: string;
  thumbnail?: string;
}

// Public Invidious instances for YouTube audio extraction (no API key needed)
const INVIDIOUS_INSTANCES = [
  'https://invidious.io.lol',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
];

// Public Piped instances as fallback
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
];

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Search YouTube for a query using Invidious API (no API key required)
 */
export async function searchYouTube(query: string, limit = 5): Promise<YouTubeResult[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title,videoThumbnails`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      return data.slice(0, limit).map((item: any) => ({
        videoId: item.videoId,
        title: item.title,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        thumbnail: item.videoThumbnails?.[0]?.url,
      }));
    } catch {
      // Try next instance
    }
  }
  return [];
}

/**
 * Get audio stream URL for a YouTube video using Invidious API
 * Returns the best audio-only stream URL
 */
export async function getAudioStreamUrl(videoId: string): Promise<string | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();

      // Try adaptive audio-only formats first (best quality)
      const audioFormats = (data.adaptiveFormats || []).filter((f: any) =>
        f.type?.startsWith('audio/') && f.url
      );

      if (audioFormats.length > 0) {
        // Sort by bitrate descending
        audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        return audioFormats[0].url;
      }

      // Fallback to format streams (muxed video+audio)
      const streams = data.formatStreams || [];
      if (streams.length > 0) {
        return streams[0].url;
      }
    } catch {
      // Try next instance
    }
  }

  // Try Piped API as last resort
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/streams/${videoId}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      const audioStreams = data.audioStreams || [];
      if (audioStreams.length > 0) {
        audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        return audioStreams[0].url;
      }
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Scrape Spotify page to extract track list (no API key needed)
 * Mirrors core/downloader.py _scrape_spotify_url()
 */
export async function scrapeSpotifyUrl(spotifyUrl: string): Promise<SpotifyTrack[]> {
  try {
    const res = await fetchWithTimeout(spotifyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, 15000);

    if (!res.ok) return [];
    const html = await res.text();

    // Extract JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd['@type'] === 'MusicRecording') {
          return [{
            name: jsonLd.name || '',
            artist: jsonLd.byArtist?.name || '',
            album: jsonLd.inAlbum?.name || '',
          }];
        }
        if (jsonLd['@type'] === 'MusicPlaylist' && Array.isArray(jsonLd.track)) {
          return jsonLd.track.map((t: any) => ({
            name: t.name || '',
            artist: t.byArtist?.name || '',
            album: '',
          }));
        }
      } catch { /* ignore */ }
    }

    // Extract Open Graph meta tags as fallback
    const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
    const ogDescription = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
    if (ogTitle) {
      const parts = ogTitle.split(' · ');
      return [{
        name: parts[0] || ogTitle,
        artist: ogDescription?.split(' · ')?.[0] || '',
        album: parts[1] || '',
      }];
    }

    return [];
  } catch (err) {
    console.warn('Spotify scrape error:', err);
    return [];
  }
}

/**
 * Search Spotify using the official API (requires client credentials)
 */
export async function searchSpotifyApi(
  query: string,
  clientId: string,
  clientSecret: string,
  limit = 10
): Promise<SpotifyTrack[]> {
  try {
    // Get access token
    const tokenRes = await fetchWithTimeout('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) return [];
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Search tracks
    const searchRes = await fetchWithTimeout(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();

    return (searchData.tracks?.items || []).map((item: any) => ({
      name: item.name,
      artist: item.artists?.[0]?.name || '',
      album: item.album?.name || '',
      duration_ms: item.duration_ms,
      spotify_url: item.external_urls?.spotify,
    }));
  } catch (err) {
    console.warn('Spotify API error:', err);
    return [];
  }
}

/**
 * Fetch lyrics for a track (mirrors core/metadata.py fetch_lyrics)
 * Tries lyrics.ovh first, then Genius scraping
 */
export async function fetchLyrics(title: string, artist: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.lyrics) return data.lyrics;
    }
  } catch { /* fallback */ }

  // Genius scraping fallback
  try {
    const slug = `${artist}-${title}-lyrics`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const geniusUrl = `https://genius.com/${slug}`;
    const res = await fetchWithTimeout(geniusUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const html = await res.text();
      const containers = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g) || [];
      const parts = containers.map(c => c.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      if (parts.length) return parts.join('\n\n');
    }
  } catch { /* ignore */ }

  return '';
}

/**
 * Search MusicBrainz for release metadata
 */
export async function searchMusicBrainz(query: string): Promise<any[]> {
  try {
    const res = await fetchWithTimeout(
      `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&fmt=json&limit=10`,
      { headers: { 'User-Agent': 'NexsusAudio/1.0 (android)' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.releases || [];
  } catch {
    return [];
  }
}
