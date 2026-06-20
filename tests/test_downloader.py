import os
import sys
import unittest
from unittest.mock import patch, MagicMock, Mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.downloader import Downloader


class TestDownloader(unittest.TestCase):
    def setUp(self):
        self.downloader = Downloader()

    def test_cancel_sets_event(self):
        self.assertFalse(self.downloader._cancel_event.is_set())
        self.downloader.cancel()
        self.assertTrue(self.downloader._cancel_event.is_set())

    def test_cancel_all_clears_queue_and_sets_event(self):
        self.downloader._queue = [1, 2, 3]
        self.downloader._queue_running = True
        self.downloader.cancel_all()
        self.assertTrue(self.downloader._cancel_event.is_set())
        self.assertEqual(self.downloader.get_queue_length(), 0)
        self.assertFalse(self.downloader._queue_running)

    def test_reset_cancel_clears_event(self):
        self.downloader.cancel()
        self.assertTrue(self.downloader._cancel_event.is_set())
        self.downloader.reset_cancel()
        self.assertFalse(self.downloader._cancel_event.is_set())

    def test_queue_track_adds_item(self):
        track_info = {'name': 'Test', 'artist': 'Test Artist'}
        length = self.downloader.queue_track(track_info, '/tmp')
        self.assertEqual(length, 1)
        self.assertEqual(self.downloader.get_queue_length(), 1)

    def test_get_queue_returns_copy(self):
        self.downloader.queue_track({'name': 'A', 'artist': 'B'}, '/tmp')
        q = self.downloader.get_queue()
        self.assertEqual(len(q), 1)
        q.clear()
        self.assertEqual(self.downloader.get_queue_length(), 1)

    def test_get_queue_length_multiple_items(self):
        self.downloader.queue_track({'name': 'A', 'artist': 'B'}, '/tmp')
        self.downloader.queue_track({'name': 'C', 'artist': 'D'}, '/tmp')
        self.downloader.queue_track({'name': 'E', 'artist': 'F'}, '/tmp')
        self.assertEqual(self.downloader.get_queue_length(), 3)

    @patch('core.downloader.YoutubeDL')
    def test_search_youtube_returns_urls(self, mock_ydl):
        mock_ydl_instance = MagicMock()
        mock_ydl.return_value.__enter__.return_value = mock_ydl_instance
        mock_ydl_instance.extract_info.return_value = {
            'entries': [
                {'id': 'abc123'},
                {'id': 'def456'},
            ]
        }
        urls = self.downloader.search_youtube('test query', limit=2)
        self.assertEqual(len(urls), 2)
        self.assertEqual(urls[0], 'https://www.youtube.com/watch?v=abc123')
        self.assertEqual(urls[1], 'https://www.youtube.com/watch?v=def456')
        mock_ydl_instance.extract_info.assert_called_once_with(
            'ytsearch2:test query', download=False
        )

    @patch('core.downloader.YoutubeDL')
    def test_search_youtube_skips_none_entries(self, mock_ydl):
        mock_ydl_instance = MagicMock()
        mock_ydl.return_value.__enter__.return_value = mock_ydl_instance
        mock_ydl_instance.extract_info.return_value = {
            'entries': [None, {'id': 'valid1'}, None]
        }
        urls = self.downloader.search_youtube('test', limit=3)
        self.assertEqual(len(urls), 1)
        self.assertEqual(urls[0], 'https://www.youtube.com/watch?v=valid1')

    @patch('core.downloader.YoutubeDL')
    def test_search_youtube_returns_empty_on_cancelled(self, mock_ydl):
        self.downloader.cancel()
        urls = self.downloader.search_youtube('test', limit=5)
        self.assertEqual(urls, [])
        mock_ydl.assert_not_called()

    @patch('core.downloader.YoutubeDL')
    def test_search_youtube_returns_empty_on_exception(self, mock_ydl):
        mock_ydl_instance = MagicMock()
        mock_ydl.return_value.__enter__.return_value = mock_ydl_instance
        mock_ydl_instance.extract_info.side_effect = Exception('API error')
        urls = self.downloader.search_youtube('test', limit=5)
        self.assertEqual(urls, [])

    def test_search_spotify_returns_tracks(self):
        mock_sp = MagicMock()
        self.downloader.sp = mock_sp
        mock_sp.search.return_value = {
            'tracks': {
                'items': [
                    {
                        'name': 'Test Track',
                        'artists': [{'name': 'Test Artist'}],
                        'album': {'name': 'Test Album'},
                        'duration_ms': 200000,
                        'external_urls': {'spotify': 'https://spotify.com/track/1'},
                    }
                ]
            }
        }
        tracks = self.downloader.search_spotify('test', limit=1)
        self.assertEqual(len(tracks), 1)
        self.assertEqual(tracks[0]['name'], 'Test Track')
        self.assertEqual(tracks[0]['artist'], 'Test Artist')

    def test_search_spotify_returns_empty_when_not_initialized(self):
        self.downloader.sp = None
        tracks = self.downloader.search_spotify('test')
        self.assertEqual(tracks, [])

    def test_search_spotify_returns_empty_when_cancelled(self):
        mock_sp = MagicMock()
        self.downloader.sp = mock_sp
        self.downloader.cancel()
        tracks = self.downloader.search_spotify('test', limit=5)
        self.assertEqual(tracks, [])

    def test_get_tracks_from_url_returns_empty_when_no_sp(self):
        self.downloader.sp = None
        tracks = self.downloader.get_tracks_from_url('https://open.spotify.com/track/abc')
        self.assertEqual(tracks, [])

    def test_process_queue_warns_when_already_running(self):
        self.downloader._queue_running = True
        with self.assertLogs(level='WARNING') as log:
            self.downloader.process_queue()
            self.assertTrue(any('already running' in m for m in log.output))


if __name__ == '__main__':
    unittest.main()
