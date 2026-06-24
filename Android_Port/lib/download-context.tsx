import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export type DownloadStatus = 'pending' | 'downloading' | 'done' | 'error' | 'cancelled';

export interface DownloadItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  url: string;
  filename: string;
  status: DownloadStatus;
  progress: number; // 0-100
  localUri?: string;
  error?: string;
  format: string;
}

interface DownloadContextValue {
  queue: DownloadItem[];
  activeCount: number;
  addToQueue: (items: Omit<DownloadItem, 'id' | 'status' | 'progress'>[]) => void;
  cancelDownload: (id: string) => void;
  cancelAll: () => void;
  clearCompleted: () => void;
  retryDownload: (id: string) => void;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

const MAX_CONCURRENT = 2;

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const downloadTasks = useRef<Map<string, FileSystem.DownloadResumable>>(new Map());
  const processingRef = useRef(false);

  const updateItem = useCallback((id: string, updates: Partial<DownloadItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const processQueue = useCallback(async (currentQueue: DownloadItem[]) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const pending = currentQueue.filter(i => i.status === 'pending');
    const downloading = currentQueue.filter(i => i.status === 'downloading');
    const slots = MAX_CONCURRENT - downloading.length;

    for (let i = 0; i < Math.min(slots, pending.length); i++) {
      const item = pending[i];
      updateItem(item.id, { status: 'downloading', progress: 0 });

      const destDir = FileSystem.documentDirectory + 'downloads/';
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true }).catch(() => {});
      const destUri = destDir + item.filename;

      const task = FileSystem.createDownloadResumable(
        item.url,
        destUri,
        {},
        (downloadProgress) => {
          const pct = downloadProgress.totalBytesExpectedToWrite > 0
            ? Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100)
            : 0;
          updateItem(item.id, { progress: pct });
        }
      );

      downloadTasks.current.set(item.id, task);

      task.downloadAsync()
        .then(result => {
          if (result) {
            updateItem(item.id, { status: 'done', progress: 100, localUri: result.uri });
          }
          downloadTasks.current.delete(item.id);
        })
        .catch(err => {
          if (err?.message?.includes('cancelled')) {
            updateItem(item.id, { status: 'cancelled' });
          } else {
            updateItem(item.id, { status: 'error', error: err?.message ?? 'Download failed' });
          }
          downloadTasks.current.delete(item.id);
        });
    }

    processingRef.current = false;
  }, [updateItem]);

  const addToQueue = useCallback((items: Omit<DownloadItem, 'id' | 'status' | 'progress'>[]) => {
    const newItems: DownloadItem[] = items.map(item => ({
      ...item,
      id: `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      progress: 0,
    }));
    setQueue(prev => {
      const updated = [...prev, ...newItems];
      setTimeout(() => processQueue(updated), 100);
      return updated;
    });
  }, [processQueue]);

  const cancelDownload = useCallback((id: string) => {
    const task = downloadTasks.current.get(id);
    if (task) {
      task.cancelAsync().catch(() => {});
      downloadTasks.current.delete(id);
    }
    updateItem(id, { status: 'cancelled' });
  }, [updateItem]);

  const cancelAll = useCallback(() => {
    downloadTasks.current.forEach((task) => task.cancelAsync().catch(() => {}));
    downloadTasks.current.clear();
    setQueue(prev => prev.map(item =>
      item.status === 'pending' || item.status === 'downloading'
        ? { ...item, status: 'cancelled' }
        : item
    ));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(item =>
      item.status !== 'done' && item.status !== 'cancelled' && item.status !== 'error'
    ));
  }, []);

  const retryDownload = useCallback((id: string) => {
    updateItem(id, { status: 'pending', progress: 0, error: undefined });
    setQueue(prev => {
      setTimeout(() => processQueue(prev), 100);
      return prev;
    });
  }, [updateItem, processQueue]);

  const activeCount = queue.filter(i => i.status === 'downloading').length;

  return (
    <DownloadContext.Provider value={{
      queue,
      activeCount,
      addToQueue,
      cancelDownload,
      cancelAll,
      clearCompleted,
      retryDownload,
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloadContext() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloadContext must be used within DownloadProvider');
  return ctx;
}
