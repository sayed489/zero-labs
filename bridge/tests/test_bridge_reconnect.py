import json
from pathlib import Path
import socket
import ssl
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import forge_bridge as bridge
except SystemExit:
    bridge = None

@unittest.skipIf(bridge is None, 'websocket-client is not installed')
class ReconnectTests(unittest.TestCase):
    def test_dns_and_tls_failures_back_off_and_close_each_socket(self):
        b = bridge.Bridge.__new__(bridge.Bridge)
        b.config = {'workerWebSocketUrl': 'wss://example.com', 'deviceToken': 'token'}
        b.stop = threading.Event()
        apps = [Mock(), Mock(), Mock()]
        apps[0].run_forever.side_effect = socket.gaierror(11001, 'DNS failed')
        apps[1].run_forever.side_effect = ssl.SSLEOFError('EOF')
        apps[2].run_forever.side_effect = KeyboardInterrupt()
        with tempfile.TemporaryDirectory() as folder, patch.object(bridge, 'READY_PATH', Path(folder) / 'ready'), \
             patch.object(bridge.websocket, 'WebSocketApp', side_effect=apps), \
             patch.object(bridge.time, 'sleep') as sleep, \
             patch.object(bridge.random, 'uniform', side_effect=lambda low, high: high), \
             patch.dict(bridge.os.environ, {'FORGE_ONCE': ''}):
            with self.assertRaises(KeyboardInterrupt):
                b.run()
            self.assertEqual([c.args[0] for c in sleep.call_args_list], [1, 2])
            for app in apps:
                app.close.assert_called_once()
                self.assertEqual(app.run_forever.call_args.kwargs['sslopt']['cert_reqs'], ssl.CERT_REQUIRED)

    def test_ready_only_after_stable_ack_and_cleared_on_disconnect(self):
        b = bridge.Bridge.__new__(bridge.Bridge)
        b.connected_monotonic = 100
        b.device_id = 'laptop'
        b.stop = threading.Event()
        with tempfile.TemporaryDirectory() as folder, patch.object(bridge, 'READY_PATH', Path(folder) / 'ready'):
            with patch.object(bridge.time, 'monotonic', return_value=101):
                b.on_message(None, '{"type":"heartbeat_ack"}')
                self.assertFalse(bridge.READY_PATH.exists())
            with patch.object(bridge.time, 'monotonic', return_value=116):
                b.on_message(None, '{"type":"heartbeat_ack"}')
                self.assertEqual(json.loads(bridge.READY_PATH.read_text())['deviceId'], 'laptop')
            b.on_close(None, None, None)
            self.assertFalse(bridge.READY_PATH.exists())

    def test_windows_single_instance_lock_is_exclusive(self):
        lock = Mock()
        with patch.object(bridge.socket, 'socket', return_value=lock), \
             patch.object(bridge.os, 'name', 'nt'), \
             patch.object(bridge.socket, 'SO_EXCLUSIVEADDRUSE', -5, create=True):
            self.assertIs(bridge.acquire_single_instance(), lock)
            lock.setsockopt.assert_called_once_with(bridge.socket.SOL_SOCKET, -5, 1)
            lock.bind.assert_called_once_with(('127.0.0.1', bridge.LOCK_PORT))
