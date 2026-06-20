"""
NexusAudio - Integrated Soulseek P2P functionality
Implements the SLSK wire protocol over TCP sockets
"""
import os
import socket
import struct
import threading
import time
import hashlib
import logging

logger = logging.getLogger(__name__)

# Message codes (Client → Server)
CODE_LOGIN = 1
CODE_SET_LISTEN_PORT = 2
CODE_GET_USER_ADDRESS = 3
CODE_GET_PEER_ADDRESS_RESP = 3
CODE_FILE_SEARCH = 26
CODE_SET_STATUS = 28
CODE_PING = 32
CODE_SHARED_FOLDERS = 35
CODE_HAVE_NO_PARENT = 71

# Message codes (Server → Client)
CODE_LOGIN_RESP = 1
CODE_USER_ADDRESS_RESP = 18   # ConnectToPeer
CODE_PING_RESP = 32
CODE_GET_USER_STATUS = 7
CODE_GET_USER_STATS = 36
CODE_RELOGGED = 41
CODE_PLACE_IN_QUEUE_RESP = 44
CODE_SERVER_MESSAGE = 53
CODE_PRIVILEGED_USERS = 69
CODE_BRANCH_LEVEL = 83
CODE_BRANCH_ROOT = 84
CODE_PARENT_SPEED = 85
CODE_DISTRIB_PARENT = 102
CODE_WISHLIST_INTERVAL = 104

# Client version (177 = reserved for experimental clients per SLSK protocol)
CLIENT_MAJOR_VERSION = 177
CLIENT_MINOR_VERSION = 1

# Peer transfer message codes (outgoing, for requesting downloads)
CODE_P_FILE_REQUEST = 4
CODE_P_FILE_RESPONSE = 0
CODE_P_TRANSFER_ERROR = 5

# Peer message codes (incoming from other peers)
CODE_P_FILE_SEARCH_RESP = 9
CODE_P_PLACE_IN_QUEUE_REQ = 43
CODE_P_QUEUE_UPLOAD = 44

DEFAULT_SERVER = "server.slsknet.org"
DEFAULT_PORT = 2242
SOCKET_TIMEOUT = 5
MAX_RECONNECT_ATTEMPTS = 3
RECONNECT_BACKOFF_BASE = 2
TRANSFER_TIMEOUT = 60
CHUNK_SIZE = 65536
KEEPALIVE_IDLE = 10
KEEPALIVE_INTERVAL = 2


def _pack_string(s):
    """Length-prefixed string: 4-byte LE length + UTF-8 bytes."""
    data = s.encode("utf-8", errors="replace")
    return struct.pack("<I", len(data)) + data


def _unpack_string(buf, offset):
    """Read a length-prefixed string from buffer at offset."""
    if offset + 4 > len(buf):
        return "", len(buf)
    length = struct.unpack("<I", buf[offset:offset + 4])[0]
    start = offset + 4
    end = start + length
    if end > len(buf):
        raw = buf[start:]
        return raw.decode("utf-8", errors="replace"), len(buf)
    raw = buf[start:end]
    return raw.decode("utf-8", errors="replace"), end


def _unpack_bool(buf, offset):
    if offset >= len(buf):
        return False, offset
    return bool(buf[offset]), offset + 1


def _set_socket_keepalive(sock, idle=KEEPALIVE_IDLE, interval=KEEPALIVE_INTERVAL):
    """Use TCP keepalive instead of ServerPing (code 32), which modern servers reject."""
    if hasattr(socket, "SO_KEEPALIVE"):
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    if hasattr(socket, "TCP_KEEPIDLE"):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, idle)
    if hasattr(socket, "TCP_KEEPINTVL"):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, interval)
    if hasattr(socket, "TCP_KEEPCNT"):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
    elif hasattr(socket, "TCP_KEEPALIVE"):
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPALIVE, idle)


def _read_exactly(sock, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("Connection closed")
        buf.extend(chunk)
    return bytes(buf)


def _send_message(sock, code, payload=b""):
    msg = struct.pack("<I", code) + payload
    header = struct.pack("<I", len(msg))
    sock.sendall(header + msg)


class PeerServer:
    """Listens for incoming peer connections to receive search results."""

    def __init__(self, username, port=0):
        self.username = username
        self.port = port
        self._server = None
        self._stop = threading.Event()
        self.on_peer_search_response = None

    def start(self):
        try:
            self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self._server.bind(('0.0.0.0', self.port))
            self._server.listen(10)
            self._server.settimeout(1)
            if self.port == 0:
                self.port = self._server.getsockname()[1]
            self._stop.clear()
            threading.Thread(target=self._accept_loop, daemon=True).start()
            logger.info("Peer server listening on port %d", self.port)
            return True
        except OSError as e:
            logger.warning("Peer server failed to start: %s", e)
            return False

    def stop(self):
        self._stop.set()
        if self._server:
            try:
                self._server.close()
            except OSError:
                pass
            self._server = None

    def _accept_loop(self):
        while not self._stop.is_set():
            try:
                sock, addr = self._server.accept()
                threading.Thread(target=self._handle_peer, args=(sock, addr), daemon=True).start()
            except socket.timeout:
                continue
            except OSError:
                break

    def _handle_peer(self, sock, addr):
        try:
            sock.settimeout(30)
            name = b''
            while True:
                c = sock.recv(1)
                if not c or c == b'\x00':
                    break
                name += c
            peer_user = name.decode("utf-8", errors="replace")
            logger.debug("Peer connection from %s (%s:%d)", peer_user, addr[0], addr[1])
            sock.sendall(self.username.encode("utf-8") + b'\x00')
            while not self._stop.is_set():
                raw_len = _read_exactly(sock, 4)
                msg_len = struct.unpack("<I", raw_len)[0]
                msg = _read_exactly(sock, msg_len)
                code = struct.unpack("<I", msg[:4])[0]
                self._handle_peer_msg(code, msg[4:], peer_user)
        except (ConnectionError, OSError, struct.error) as e:
            logger.debug("Peer %s disconnected: %s", addr[0], e)
        finally:
            try:
                sock.close()
            except OSError:
                pass

    def _handle_peer_msg(self, code, payload, peer_user):
        if code == CODE_P_FILE_SEARCH_RESP:
            self._parse_search_results(payload, peer_user)

    def _parse_search_results(self, payload, peer_user):
        try:
            if len(payload) < 8:
                return
            offset = 0
            token = struct.unpack("<I", payload[:4])[0]
            offset += 4
            num_files = struct.unpack("<I", payload[offset:offset + 4])[0]
            offset += 4
            results = []
            for _ in range(num_files):
                filename, offset = _unpack_string(payload, offset)
                if offset + 8 > len(payload):
                    break
                size = struct.unpack("<Q", payload[offset:offset + 8])[0]
                offset += 8
                ext, offset = _unpack_string(payload, offset)
                if offset + 4 > len(payload):
                    break
                num_attrs = struct.unpack("<I", payload[offset:offset + 4])[0]
                offset += 4
                bitrate, duration = 0, 0
                for _ in range(num_attrs):
                    if offset + 8 > len(payload):
                        break
                    atype = struct.unpack("<I", payload[offset:offset + 4])[0]
                    aval = struct.unpack("<I", payload[offset + 4:offset + 8])[0]
                    offset += 8
                    if atype == 0:
                        bitrate = aval
                    elif atype == 1:
                        duration = aval
                results.append({
                    "user": peer_user,
                    "filename": filename,
                    "size": size,
                    "extension": ext,
                    "bitrate": bitrate,
                    "length": duration,
                })
            if results and self.on_peer_search_response:
                self.on_peer_search_response(results)
        except (struct.error, IndexError) as e:
            logger.error("Bad search results from %s: %s", peer_user, e)


class SoulseekProtocol:
    """Real Soulseek protocol handler using TCP sockets."""

    def __init__(self):
        self.server = DEFAULT_SERVER
        self.port = DEFAULT_PORT
        self.username = ""
        self.password = ""
        self.connected = False
        self._socket = None
        self._recv_thread = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._login_event = threading.Event()
        self._login_success = False

        self.peer_server = None
        self.peer_port = 0

        self.on_message = None
        self.on_search_results = None
        self.on_connection = None
        self.on_error = None
        self.on_download_progress = None
        self.on_download_done = None
        self._pending_downloads = {}
        self._peer_addresses = {}

    def connect(self, username, password, server=None, port=None):
        self.username = username
        self.password = password
        if server:
            self.server = server
        if port:
            self.port = port
        self._stop_event.clear()
        thread = threading.Thread(target=self._connect_async, daemon=True)
        thread.start()
        return True

    def _connect_async(self):
        self._start_peer_server()
        attempts = 0
        while attempts < MAX_RECONNECT_ATTEMPTS and not self._stop_event.is_set():
            attempts += 1
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(SOCKET_TIMEOUT)
                sock.connect((self.server, self.port))
                sock.settimeout(None)
                _set_socket_keepalive(sock)
                with self._lock:
                    self._socket = sock
                self._login_event.clear()
                self._login_success = False
                self._send_login(sock)
                self._send_listen_port(sock, self.peer_port)
                self._start_receive(sock)
                if not self._login_event.wait(15):
                    raise ConnectionError("Login timed out")
                if not self._login_success:
                    raise ConnectionError("Login rejected by server")
                with self._lock:
                    self.connected = True
                logger.info("Connected to Soulseek at %s:%d as %s", self.server, self.port, self.username)
                if self.on_connection:
                    self.on_connection(True)
                return
            except (socket.timeout, ConnectionRefusedError, OSError) as e:
                logger.warning("Connection attempt %d/%d failed: %s", attempts, MAX_RECONNECT_ATTEMPTS, e)
                if self.on_error:
                    self.on_error(f"Connection failed (attempt {attempts}): {e}")
                if not self._stop_event.is_set():
                    backoff = RECONNECT_BACKOFF_BASE ** attempts
                    self._stop_event.wait(backoff)
        logger.error("All %d connection attempts failed", MAX_RECONNECT_ATTEMPTS)
        if self.on_error:
            self.on_error(f"Failed to connect after {MAX_RECONNECT_ATTEMPTS} attempts")

    def _start_peer_server(self):
        if self.peer_server:
            self.peer_server.stop()
        ps = PeerServer(self.username)
        if ps.start():
            ps.on_peer_search_response = self._on_peer_search_response
            self.peer_server = ps
            self.peer_port = ps.port
        else:
            self.peer_server = None
            self.peer_port = 0
            logger.warning("No peer server — search results will not be received")

    def _on_peer_search_response(self, results):
        if self.on_search_results:
            self.on_search_results(results)

    def _send_login(self, sock):
        md5_hash = hashlib.md5((self.username + self.password).encode()).hexdigest()
        payload = _pack_string(self.username) + _pack_string(self.password)
        payload += struct.pack("<I", CLIENT_MAJOR_VERSION)
        payload += _pack_string(md5_hash)
        payload += struct.pack("<I", CLIENT_MINOR_VERSION)
        _send_message(sock, CODE_LOGIN, payload)
        logger.debug("Login packet sent (md5=%s)", md5_hash)

    def _send_post_login(self, sock):
        """Announce online status and shared-folder counts (required by modern servers)."""
        _send_message(sock, CODE_SET_STATUS, struct.pack("<i", 2))  # 2 = Online
        _send_message(sock, CODE_SHARED_FOLDERS, struct.pack("<II", 0, 0))
        _send_message(sock, CODE_HAVE_NO_PARENT, b"")
        logger.debug("Post-login handshake sent")

    def _send_listen_port(self, sock, port=0):
        """Tell the server what port we're listening on for peer transfers.
        Port 0 means we don't accept incoming connections."""
        _send_message(sock, CODE_SET_LISTEN_PORT, struct.pack("<I", port))
        logger.debug("Listen port sent: %d", port)

    def _start_receive(self, sock):
        self._recv_thread = threading.Thread(target=self._receive_loop, args=(sock,), daemon=True)
        self._recv_thread.start()

    def _receive_loop(self, sock):
        while not self._stop_event.is_set():
            try:
                raw_len = _read_exactly(sock, 4)
                msg_len = struct.unpack("<I", raw_len)[0]
                msg_data = _read_exactly(sock, msg_len)
                code = struct.unpack("<I", msg_data[:4])[0]
                payload = msg_data[4:]
                self._handle_message(code, payload)
            except (ConnectionError, OSError) as e:
                logger.warning("Receive error: %s", e)
                if self.on_error:
                    self.on_error(f"Connection lost: {e}")
                break
        self._cleanup("Receive thread ended")

    def _handle_message(self, code, payload):
        if code == CODE_LOGIN_RESP:
            self._handle_login_resp(payload)
        elif code == CODE_PING_RESP:
            pass
        elif code == CODE_GET_PEER_ADDRESS_RESP:
            self._handle_peer_address_resp(payload)
        elif code == CODE_USER_ADDRESS_RESP:
            self._handle_connect_to_peer(payload)
        elif code == CODE_PLACE_IN_QUEUE_RESP:
            self._handle_place_in_queue(payload)
        elif code == CODE_RELOGGED:
            logger.warning("Logged in elsewhere — disconnecting")
            if self.on_error:
                self.on_error("Logged in from another client")
            self.disconnect()
        elif code == CODE_SERVER_MESSAGE:
            msg, _ = _unpack_string(payload, 0)
            logger.info("Server message: %s", msg)
            if self.on_message:
                self.on_message(code, payload)
        elif code == CODE_WISHLIST_INTERVAL:
            if len(payload) >= 4:
                interval = struct.unpack("<I", payload[:4])[0]
                logger.debug("Wishlist interval: %d min", interval)
        elif code in (CODE_DISTRIB_PARENT, CODE_BRANCH_LEVEL, CODE_BRANCH_ROOT,
                      CODE_PARENT_SPEED, CODE_GET_USER_STATUS, CODE_GET_USER_STATS,
                      CODE_PRIVILEGED_USERS):
            pass
        elif self.on_message:
            self.on_message(code, payload)

    def _handle_login_resp(self, payload):
        if not payload:
            logger.error("Login response empty")
            self._login_success = False
            self._login_event.set()
            return
        success, offset = _unpack_bool(payload, 0)
        if success:
            greet, offset = _unpack_string(payload, offset)
            logger.info("Login successful: %s", greet[:80] if greet else "")
            with self._lock:
                sock = self._socket
            if sock:
                self._send_post_login(sock)
            self._login_success = True
        else:
            reason, _ = _unpack_string(payload, offset)
            logger.error("Login rejected: %s", reason)
            if self.on_error:
                self.on_error(f"Login rejected: {reason}")
            self._login_success = False
            self.disconnect()
        self._login_event.set()

    def _cleanup(self, reason=""):
        if reason:
            logger.info("Cleanup: %s", reason)
        if self.peer_server:
            self.peer_server.stop()
            self.peer_server = None
        with self._lock:
            was_connected = self.connected
            self.connected = False
            if self._socket:
                try:
                    self._socket.close()
                except OSError:
                    pass
                self._socket = None
        if was_connected and self.on_connection:
            self.on_connection(False)

    def disconnect(self):
        self._stop_event.set()
        self._cleanup("User requested disconnect")

    def search(self, query):
        with self._lock:
            sock = self._socket
            if not sock or not self.connected:
                logger.warning("Cannot search: not connected")
                return []
        ticket = int(time.time())
        payload = struct.pack("<I", ticket) + _pack_string(query)
        try:
            _send_message(sock, CODE_FILE_SEARCH, payload)
            logger.info("Search sent: ticket=%d query='%s'", ticket, query)
        except OSError as e:
            logger.error("Search send failed: %s", e)
            if self.on_error:
                self.on_error(f"Search failed: {e}")
            return []
        return ticket

    def _ip_to_str(self, ip_bytes):
        return socket.inet_ntoa(ip_bytes[::-1])

    def _handle_peer_address_resp(self, payload):
        """Server code 3 response: peer IP and port for downloads."""
        try:
            offset = 0
            username, offset = _unpack_string(payload, offset)
            if offset + 4 > len(payload):
                return
            ip = self._ip_to_str(payload[offset:offset + 4])
            offset += 4
            port = struct.unpack("<I", payload[offset:offset + 4])[0]
            offset += 4
            if not port or ip == "0.0.0.0":
                logger.warning("Peer %s is offline or has no listen port", username)
                if self.on_error:
                    self.on_error(f"User {username} is offline")
                return
            with self._lock:
                pending = [
                    dl for dl in self._pending_downloads.values()
                    if dl.get("peer_user") == username
                ]
            for dl in pending:
                thread = threading.Thread(
                    target=self._do_peer_transfer,
                    args=(ip, port, dl["peer_user"], dl["filename"],
                          dl["output_path"], dl["ticket"]),
                    daemon=True
                )
                thread.start()
        except (struct.error, IndexError) as e:
            logger.error("Failed to parse peer address response: %s", e)

    def _handle_connect_to_peer(self, payload):
        """Server code 18: indirect connection request (ignored for now)."""
        try:
            offset = 0
            username, offset = _unpack_string(payload, offset)
            conn_type, offset = _unpack_string(payload, offset)
            logger.debug("ConnectToPeer from %s type=%s (not handled)", username, conn_type)
        except (struct.error, IndexError):
            pass

    def _handle_place_in_queue(self, payload):
        try:
            username, offset = _unpack_string(payload, 0)
            filename, offset = _unpack_string(payload, offset)
            logger.info("Place in queue response: %s requested file from %s", filename, username)
            with self._lock:
                for dl in self._pending_downloads.values():
                    if dl.get("peer_user") == username:
                        dl["queued"] = True
        except (struct.error, IndexError) as e:
            logger.error("Failed to parse place-in-queue: %s", e)

    def _do_peer_transfer(self, peer_ip, peer_port, peer_user, filename, output_path, ticket):
        """Connect to peer and transfer a file over the SLSK peer protocol."""
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(TRANSFER_TIMEOUT)
            sock.connect((peer_ip, peer_port))

            peer_username_b = b''
            while True:
                b = sock.recv(1)
                if not b or b == b'\x00':
                    break
                peer_username_b += b
            received_peer = peer_username_b.decode("utf-8", errors="replace")
            if received_peer != peer_user:
                logger.warning("Connected to %s but peer identified as %s", peer_user, received_peer)

            sock.sendall(self.username.encode("utf-8") + b'\x00')

            payload = struct.pack("<I", CODE_P_FILE_REQUEST)
            payload += filename.encode("utf-8") + b'\x00'
            payload += struct.pack("<Q", 0)
            msg = struct.pack("<I", len(payload)) + payload
            sock.sendall(msg)

            raw_len = _read_exactly(sock, 4)
            msg_len = struct.unpack("<I", raw_len)[0]
            resp_code_data = _read_exactly(sock, 4)
            resp_code = struct.unpack("<I", resp_code_data)[0]

            if resp_code != 0:
                err = f"Peer returned error code {resp_code}"
                logger.warning("Peer transfer error: %s", err)
                if self.on_error:
                    self.on_error(err)
                sock.close()
                return

            file_data_len = msg_len - 4
            output_dir = os.path.dirname(output_path)
            os.makedirs(output_dir, exist_ok=True)
            downloaded = 0
            with open(output_path, 'wb') as f:
                while file_data_len > 0:
                    chunk = _read_exactly(sock, min(CHUNK_SIZE, file_data_len))
                    f.write(chunk)
                    downloaded += len(chunk)
                    file_data_len -= len(chunk)
                    if self.on_download_progress:
                        self.on_download_progress(ticket, downloaded)
            logger.info("Downloaded %d bytes for ticket %d: %s", downloaded, ticket, filename)
            if self.on_download_done:
                self.on_download_done(ticket, output_path, True)
        except (socket.timeout, ConnectionError, OSError) as e:
            logger.warning("Peer transfer failed for %s: %s", filename, e)
            if self.on_error:
                self.on_error(f"Transfer failed for {filename}: {e}")
            if self.on_download_done:
                self.on_download_done(ticket, None, False)
        finally:
            if sock:
                try:
                    sock.close()
                except OSError:
                    pass

    def download(self, username, filename, output_path=None):
        with self._lock:
            sock = self._socket
            if not sock or not self.connected:
                logger.warning("Cannot download: not connected")
                return None
            ticket = int(time.time())
            out = output_path or os.path.join(os.getcwd(), os.path.basename(filename.replace('\\', '/')))
            dl = {
                "peer_user": username,
                "filename": filename,
                "output_path": out,
                "ticket": ticket,
                "queued": False,
            }
            self._pending_downloads[ticket] = dl

        payload = _pack_string(username)
        try:
            _send_message(sock, CODE_GET_USER_ADDRESS, payload)
            logger.info("Download queued: ticket=%d file='%s' from %s", ticket, filename, username)
            return ticket
        except OSError as e:
            logger.error("Download request failed: %s", e)
            return None


class P2PManager:
    """Integrated P2P manager using Soulseek protocol."""

    def __init__(self, status_callback=None, search_callback=None,
                 download_callback=None, error_callback=None,
                 connection_callback=None, transfer_callback=None):
        self.protocol = SoulseekProtocol()
        self.status_callback = status_callback
        self.search_callback = search_callback
        self.download_callback = download_callback
        self.error_callback = error_callback
        self.connection_callback = connection_callback
        self.transfer_callback = transfer_callback
        self.search_results = []
        self.downloads = []
        self._lock = threading.Lock()
        self._setup_callbacks()

    def _setup_callbacks(self):
        def on_connection(status):
            if status:
                self.log("Connected to Soulseek")
            else:
                self.log("Disconnected from Soulseek")
            if self.connection_callback:
                self.connection_callback(status)

        def on_search_results(results):
            with self._lock:
                self.search_results.extend(results)
            count = len(results)
            self.log(f"Received {count} search result(s)")
            if self.search_callback:
                for r in results:
                    self.search_callback(r)

        def on_error(msg):
            logger.error("P2P error: %s", msg)
            if self.error_callback:
                self.error_callback(msg)

        def on_download_progress(ticket, downloaded):
            if self.transfer_callback:
                self.transfer_callback(ticket, downloaded, None, "downloading")

        def on_download_done(ticket, path, success):
            status = "complete" if success else "failed"
            if self.transfer_callback:
                self.transfer_callback(ticket, 0, path, status)
            if success:
                self.log(f"Download complete: {os.path.basename(path or '')}")
            else:
                self.log(f"Download failed (ticket #{ticket})")

        self.protocol.on_connection = on_connection
        self.protocol.on_search_results = on_search_results
        self.protocol.on_error = on_error
        self.protocol.on_download_progress = on_download_progress
        self.protocol.on_download_done = on_download_done

    def log(self, message):
        if self.status_callback:
            self.status_callback(message)

    def connect(self, username, password, server=DEFAULT_SERVER, port=DEFAULT_PORT):
        self.protocol.connect(username, password, server, port)
        return True

    def disconnect(self):
        self.protocol.disconnect()

    def search_files(self, query):
        if not self.is_connected:
            self.log("Not connected to Soulseek")
            return None
        ticket = self.protocol.search(query)
        if ticket:
            self.log(f"Searching for '{query}' (ticket #{ticket})")
        else:
            self.log("Search failed to send")
        return ticket

    def download_file(self, username, filename, output_dir=None):
        if not self.is_connected:
            self.log("Not connected to Soulseek")
            return None
        out = output_dir or os.getcwd()
        out_path = os.path.join(out, os.path.basename(filename.replace('\\', '/')))
        ticket = self.protocol.download(username, filename, out_path)
        if ticket is not None:
            with self._lock:
                self.downloads.append({
                    "user": username,
                    "filename": filename,
                    "status": "queued",
                    "ticket": ticket,
                    "path": out_path,
                    "downloaded": 0,
                })
            self.log(f"Download queued: {filename} from {username} (ticket #{ticket})")
            if self.download_callback:
                self.download_callback(username, filename, ticket)
        else:
            self.log("Download failed to send")
        return ticket

    @property
    def is_connected(self):
        with self._lock:
            return self.protocol.connected
