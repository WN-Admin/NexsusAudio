/**
 * NexsusAudio — slskd REST API Service (Android equivalent of core/nicotine_integration.py)
 *
 * Desktop: Raw SLSK TCP wire protocol (nicotine_integration.py)
 * Android: slskd REST API (https://github.com/slskd/slskd) — a modern Soulseek daemon with REST API
 *
 * slskd must be running on a server/NAS. Users configure the URL + API key in Settings.
 */

export interface SlskSearchResult {
  username: string;
  filename: string;
  size: number;
  bitRate?: number;
  length?: number;
  extension: string;
  isLocked: boolean;
}

export interface SlskSearchResponse {
  id: string;
  searchText: string;
  state: 'InProgress' | 'Completed' | 'Cancelled';
  fileCount: number;
  files: SlskSearchResult[];
}

export interface SlskDownloadRequest {
  username: string;
  filename: string;
  size: number;
}

async function slskdFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v0${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...(options?.headers || {}),
    },
  });
}

/**
 * Check if slskd is reachable and authenticated
 */
export async function checkSlskdConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    const res = await slskdFetch(baseUrl, apiKey, '/application');
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Search for files on Soulseek via slskd REST API
 * Mirrors the P2P search in nicotine_integration.py
 */
export async function searchSlskd(
  baseUrl: string,
  apiKey: string,
  query: string,
  timeoutMs = 15000
): Promise<SlskSearchResult[]> {
  // Initiate search
  const searchRes = await slskdFetch(baseUrl, apiKey, '/searches', {
    method: 'POST',
    body: JSON.stringify({ searchText: query }),
  });

  if (!searchRes.ok) {
    throw new Error(`Search failed: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();
  const searchId: string = searchData.id;

  // Poll for results
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));

    const statusRes = await slskdFetch(baseUrl, apiKey, `/searches/${searchId}`);
    if (!statusRes.ok) break;

    const status: SlskSearchResponse = await statusRes.json();

    if (status.state === 'Completed' || status.fileCount > 20) {
      // Cancel search to free resources
      await slskdFetch(baseUrl, apiKey, `/searches/${searchId}`, { method: 'DELETE' }).catch(() => {});
      return status.files || [];
    }
  }

  // Timeout — return whatever we have
  try {
    const finalRes = await slskdFetch(baseUrl, apiKey, `/searches/${searchId}`);
    if (finalRes.ok) {
      const final: SlskSearchResponse = await finalRes.json();
      await slskdFetch(baseUrl, apiKey, `/searches/${searchId}`, { method: 'DELETE' }).catch(() => {});
      return final.files || [];
    }
  } catch { /* ignore */ }

  return [];
}

/**
 * Initiate a file download from a Soulseek peer via slskd
 */
export async function downloadFromSlskd(
  baseUrl: string,
  apiKey: string,
  request: SlskDownloadRequest
): Promise<boolean> {
  try {
    const res = await slskdFetch(
      baseUrl,
      apiKey,
      `/users/${encodeURIComponent(request.username)}/files`,
      {
        method: 'POST',
        body: JSON.stringify([{
          filename: request.filename,
          size: request.size,
        }]),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get current download queue from slskd
 */
export async function getSlskdDownloads(baseUrl: string, apiKey: string): Promise<any[]> {
  try {
    const res = await slskdFetch(baseUrl, apiKey, '/transfers/downloads');
    if (!res.ok) return [];
    const data = await res.json();
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
