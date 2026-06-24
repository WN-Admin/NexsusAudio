import os
import sys
import struct
import hashlib
import unittest
from unittest.mock import patch, MagicMock, call

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.nicotine_integration import (
    SoulseekProtocol, P2PManager,
    _pack_string, _unpack_string, _send_message, _unpack_bool,
    CODE_LOGIN, CODE_LOGIN_RESP, CODE_FILE_SEARCH,
    CLIENT_MAJOR_VERSION, CLIENT_MINOR_VERSION,
    DEFAULT_SERVER, DEFAULT_PORT,
)


class TestPackUnpack(unittest.TestCase):
    def test_pack_string_uses_length_prefix(self):
        data = _pack_string('hello')
        length = struct.unpack('<I', data[:4])[0]
        self.assertEqual(length, 5)
        self.assertEqual(data[4:], b'hello')

    def test_pack_string_encodes_unicode(self):
        data = _pack_string('héllo')
        length = struct.unpack('<I', data[:4])[0]
        self.assertEqual(length, 6)
        self.assertEqual(data[4:], 'héllo'.encode())

    def test_unpack_string_reads_length_prefix(self):
        buf = b'\x05\x00\x00\x00hello\x05\x00\x00\x00world'
        s, offset = _unpack_string(buf, 0)
        self.assertEqual(s, 'hello')
        self.assertEqual(offset, 9)

    def test_unpack_string_reads_rest_on_truncated(self):
        buf = b'\x0b\x00\x00\x00hello world'
        s, offset = _unpack_string(buf, 0)
        self.assertEqual(s, 'hello world')
        self.assertEqual(offset, len(buf))

    def test_unpack_string_with_offset(self):
        buf = b'xyz\x08\x00\x00\x00testuserxyz'
        s, offset = _unpack_string(buf, 3)
        self.assertEqual(s, 'testuser')
        self.assertEqual(offset, 15)


class TestSendMessage(unittest.TestCase):
    def test_send_message_packs_correctly(self):
        mock_sock = MagicMock()
        payload = b'test'
        _send_message(mock_sock, CODE_LOGIN, payload)
        msg = struct.pack('<I', CODE_LOGIN) + payload
        header = struct.pack('<I', len(msg))
        mock_sock.sendall.assert_called_once_with(header + msg)

    def test_send_message_empty_payload(self):
        mock_sock = MagicMock()
        _send_message(mock_sock, CODE_LOGIN)
        msg = struct.pack('<I', CODE_LOGIN) + b''
        header = struct.pack('<I', len(msg))
        mock_sock.sendall.assert_called_once_with(header + msg)


class TestSoulseekProtocol(unittest.TestCase):
    def setUp(self):
        self.protocol = SoulseekProtocol()

    def test_initial_state(self):
        self.assertEqual(self.protocol.server, DEFAULT_SERVER)
        self.assertEqual(self.protocol.port, DEFAULT_PORT)
        self.assertFalse(self.protocol.connected)
        self.assertIsNone(self.protocol._socket)
        self.assertEqual(self.protocol.username, '')
        self.assertEqual(self.protocol.password, '')

    def test_connect_returns_true_and_starts_thread(self):
        with patch('core.nicotine_integration.socket.socket'), \
             patch.object(self.protocol, '_connect_async') as mock_async:
            result = self.protocol.connect('user', 'pass')
            self.assertTrue(result)
            mock_async.assert_called_once()

    def test_is_connected_property(self):
        self.assertFalse(self.protocol.connected)
        self.protocol.connected = True
        self.assertTrue(self.protocol.connected)

    def test_disconnect_sets_stop_event(self):
        with patch.object(self.protocol, '_cleanup') as mock_cleanup:
            self.protocol.disconnect()
            self.assertTrue(self.protocol._stop_event.is_set())
            mock_cleanup.assert_called_once_with("User requested disconnect")

    def test_send_login_packets_correctly(self):
        mock_sock = MagicMock()
        self.protocol.username = 'testuser'
        self.protocol.password = 'testpass'
        self.protocol._send_login(mock_sock)
        md5_hash = hashlib.md5(b'testusertestpass').hexdigest()
        expected_payload = (
            _pack_string('testuser') +
            _pack_string('testpass') +
            struct.pack('<I', CLIENT_MAJOR_VERSION) +
            _pack_string(md5_hash) +
            struct.pack('<I', CLIENT_MINOR_VERSION)
        )
        expected_msg = struct.pack('<I', CODE_LOGIN) + expected_payload
        expected_header = struct.pack('<I', len(expected_msg))
        mock_sock.sendall.assert_called_once_with(expected_header + expected_msg)

    def test_search_returns_ticket_when_connected(self):
        mock_sock = MagicMock()
        self.protocol._socket = mock_sock
        self.protocol.connected = True
        with patch('core.nicotine_integration.time.time', return_value=12345):
            ticket = self.protocol.search('test query')
        self.assertEqual(ticket, 12345)
        expected_payload = struct.pack('<I', 12345) + _pack_string('test query')
        expected_msg = struct.pack('<I', CODE_FILE_SEARCH) + expected_payload
        expected_header = struct.pack('<I', len(expected_msg))
        mock_sock.sendall.assert_called_once_with(expected_header + expected_msg)

    def test_search_returns_empty_when_disconnected(self):
        self.protocol.connected = False
        self.protocol._socket = None
        result = self.protocol.search('test')
        self.assertEqual(result, [])

    def test_unpack_bool_reads_single_byte(self):
        self.assertEqual(_unpack_bool(b'\x01', 0), (True, 1))
        self.assertEqual(_unpack_bool(b'\x00', 0), (False, 1))

    def test_handle_login_resp_success(self):
        greet = _pack_string('Welcome')
        payload = b'\x01' + greet + b'\x7f\x00\x00\x01' + _pack_string('abc') + b'\x00'
        self.protocol._login_event = __import__('threading').Event()
        with patch.object(self.protocol, '_send_post_login'):
            self.protocol._handle_login_resp(payload)
        self.assertTrue(self.protocol._login_success)

    def test_handle_login_resp_failure(self):
        reason = _pack_string('INVALIDPASS')
        payload = b'\x00' + reason
        self.protocol._login_event = __import__('threading').Event()
        with patch.object(self.protocol, 'disconnect'):
            self.protocol._handle_login_resp(payload)
        self.assertFalse(self.protocol._login_success)

    def test_download_returns_none_when_disconnected(self):
        self.protocol.connected = False
        result = self.protocol.download('user', 'file.mp3')
        self.assertIsNone(result)

    def test_download_returns_ticket_when_connected(self):
        mock_sock = MagicMock()
        self.protocol._socket = mock_sock
        self.protocol.connected = True
        result = self.protocol.download('user', 'file.mp3')
        self.assertIsNotNone(result)


class TestP2PManager(unittest.TestCase):
    def setUp(self):
        self.manager = P2PManager()

    def test_initial_state(self):
        self.assertIsNotNone(self.manager.protocol)
        self.assertFalse(self.manager.is_connected)
        self.assertEqual(self.manager.search_results, [])
        self.assertEqual(self.manager.downloads, [])

    def test_is_connected_delegates_to_protocol(self):
        self.assertFalse(self.manager.is_connected)
        self.manager.protocol.connected = True
        self.assertTrue(self.manager.is_connected)

    def test_connect_returns_true(self):
        with patch.object(self.manager.protocol, 'connect') as mock_connect:
            result = self.manager.connect('user', 'pass')
            self.assertTrue(result)
            mock_connect.assert_called_once_with('user', 'pass', DEFAULT_SERVER, DEFAULT_PORT)

    def test_disconnect_calls_protocol(self):
        with patch.object(self.manager.protocol, 'disconnect') as mock_dc:
            self.manager.disconnect()
            mock_dc.assert_called_once()

    def test_search_files_returns_none_when_disconnected(self):
        result = self.manager.search_files('test')
        self.assertIsNone(result)

    def test_search_files_returns_ticket_when_connected(self):
        self.manager.protocol.connected = True
        with patch.object(self.manager.protocol, 'search', return_value=12345):
            ticket = self.manager.search_files('test')
            self.assertEqual(ticket, 12345)

    def test_download_file_returns_none_when_disconnected(self):
        result = self.manager.download_file('user', 'file.mp3')
        self.assertIsNone(result)

    def test_download_file_appends_to_downloads_when_connected(self):
        self.manager.protocol.connected = True
        with patch.object(self.manager.protocol, 'download', return_value=12345):
            result = self.manager.download_file('user', 'song.mp3')
            self.assertEqual(result, 12345)
            self.assertEqual(len(self.manager.downloads), 1)
            self.assertEqual(self.manager.downloads[0]['user'], 'user')
            self.assertEqual(self.manager.downloads[0]['status'], 'queued')

    def test_search_files_returns_none_and_logs_when_disconnected(self):
        calls = []
        manager = P2PManager(status_callback=calls.append)
        result = manager.search_files('test')
        self.assertIsNone(result)
        self.assertIn('Not connected to Soulseek', calls)


if __name__ == '__main__':
    unittest.main()
