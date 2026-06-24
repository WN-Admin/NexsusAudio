/**
 * NexsusAudio — File Service (Android equivalent of core/tagger.py)
 *
 * Desktop: mutagen library for reading/writing ID3/FLAC/MP4/OGG tags
 * Android: expo-file-system for file access + server-side metadata API for tag reading
 */

import * as FileSystem from 'expo-file-system/legacy';

export interface AudioFileMeta {
  uri: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  trackNumber: string;
  duration: number;
  bitrate: number;
  format: string;
  size: number;
  lyrics?: string;
  artwork?: string;
}

const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.ogg', '.flac', '.aac', '.wav'];

/**
 * List all audio files in the app's downloads directory
 */
export async function listDownloadedFiles(): Promise<AudioFileMeta[]> {
  const dir = FileSystem.documentDirectory + 'downloads/';

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const files = await FileSystem.readDirectoryAsync(dir);

    const audioFiles = files.filter(f =>
      SUPPORTED_EXTENSIONS.some(ext => f.toLowerCase().endsWith(ext))
    );

    const results: AudioFileMeta[] = await Promise.all(
      audioFiles.map(async (filename) => {
        const uri = dir + filename;
        const info = await FileSystem.getInfoAsync(uri);
        const ext = filename.split('.').pop()?.toLowerCase() || '';

        // Parse filename as "Artist - Title.ext" if possible
        const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
        const dashIdx = nameWithoutExt.indexOf(' - ');
        const artist = dashIdx > -1 ? nameWithoutExt.substring(0, dashIdx) : '';
        const title = dashIdx > -1 ? nameWithoutExt.substring(dashIdx + 3) : nameWithoutExt;

        return {
          uri,
          filename,
          title,
          artist,
          album: '',
          genre: '',
          year: '',
          trackNumber: '',
          duration: 0,
          bitrate: 0,
          format: ext,
          size: (info as any).size || 0,
        };
      })
    );

    return results.sort((a, b) => a.filename.localeCompare(b.filename));
  } catch (err) {
    console.warn('listDownloadedFiles error:', err);
    return [];
  }
}

/**
 * Delete a downloaded file
 */
export async function deleteFile(uri: string): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rename a file to "Artist - Title.ext" format
 */
export async function renameToArtistTitle(
  uri: string,
  artist: string,
  title: string
): Promise<string | null> {
  try {
    const dir = uri.substring(0, uri.lastIndexOf('/') + 1);
    const ext = uri.substring(uri.lastIndexOf('.'));
    const sanitized = `${sanitizeFilename(artist)} - ${sanitizeFilename(title)}${ext}`;
    const newUri = dir + sanitized;

    if (newUri === uri) return uri;

    await FileSystem.moveAsync({ from: uri, to: newUri });
    return newUri;
  } catch (err) {
    console.warn('renameToArtistTitle error:', err);
    return null;
  }
}

/**
 * Get total size of downloads folder
 */
export async function getDownloadsFolderSize(): Promise<number> {
  const dir = FileSystem.documentDirectory + 'downloads/';
  try {
    const files = await FileSystem.readDirectoryAsync(dir);
    let total = 0;
    for (const f of files) {
      const info = await FileSystem.getInfoAsync(dir + f);
      total += (info as any).size || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Sanitize filename by removing illegal characters
 */
export function sanitizeFilename(text: string, maxLength = 200): string {
  const cleaned = text.replace(/[/\\<>:"|?*\x00-\x1f]/g, '').trim();
  return cleaned.substring(0, maxLength) || 'Unknown';
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format seconds to MM:SS
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
