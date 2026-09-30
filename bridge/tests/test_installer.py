"""Test the Python actually served by the TypeScript installer generator."""
import ast
import json
import io
import tarfile
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]

class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = subprocess.check_output([
            'node', '--experimental-strip-types', '--input-type=module', '-e',
            "import {pythonInstallScript} from './lib/server/install-script.ts'; process.stdout.write(pythonInstallScript('https://example.com'))",
        ], cwd=ROOT, text=True)
        cls.ns = {'__name__': 'installer_test'}
        exec(compile(source, 'served-installer.py', 'exec'), cls.ns)

    def test_selected_cli_only_is_probed(self):
        for selected, alias in [('cursor', 'agent'), ('antigravity', 'agy'), ('codex', 'codex')]:
            lookup = Mock(return_value='/bin/' + alias)
            with patch.dict(self.ns, which_cli=lookup):
                found = self.ns['prepare_cli'](selected)
            self.assertEqual(found, {selected: '/bin/' + alias})
            lookup.assert_called_once_with(alias)

    def test_missing_selection_never_falls_back(self):
        with patch.dict(self.ns, which_cli=Mock(return_value='')):
            with self.assertRaisesRegex(SystemExit, 'will not substitute'):
                self.ns['prepare_cli']('cursor')

    def test_unknown_cli_is_rejected(self):
        with self.assertRaisesRegex(SystemExit, 'Unknown selected CLI'):
            self.ns['prepare_cli']('typo')

    def test_readiness_requires_matching_device_and_fresh_ack(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            (home / 'config.json').write_text(json.dumps({'deviceId': 'laptop'}))
            for device, ack, expected in [('laptop', 99, True), ('other', 99, False), ('laptop', 1, False)]:
                (home / 'bridge-ready.json').write_text(json.dumps({'deviceId': device, 'ackAt': ack}))
                clock = Mock()
                clock.time.return_value = 100
                clock.monotonic.side_effect = [0, 0, 100]
                with patch.dict(self.ns, FORGE_HOME=home, time=clock):
                    self.assertEqual(self.ns['wait_bridge_ready'](1), expected)

    def test_upstream_overlay_installs_disconnect_guard(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder) / 'agent-remote'
            shutil.copytree(ROOT / 'vendor/agent-remote/daemon', home / 'daemon')
            server = home / 'daemon/agentremoted/server.py'
            # Use the original, unpatched response writer to exercise installation.
            original = server.read_text()
            start = original.index('    def _send_json_bytes(')
            end = original.index('    def _error(', start)
            unpatched = """    def _send_json_bytes(self, body, status=200, close=False):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors_headers()
        if close:
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(body)

"""
            original = original[:start] + unpatched + original[end:]
            server.write_text(original)
            with patch.dict(self.ns, AGENT_HOME=home, download=Mock()):
                self.ns['overlay_daemon']()
                first = server.read_text()
                self.ns['overlay_daemon']()
                self.assertEqual(server.read_text(), first)
            ast.parse(first)
            providers = home / "daemon/agentremoted/providers/__init__.py"
            ast.parse(providers.read_text())
            self.assertIn("if name == 'codex':", providers.read_text())
            self.assertIn('except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)', first)
            self.assertIn('refresh_cli_bins', first)

    def test_agy_archive_is_unpacked_without_extracting_paths(self):
        for member_name, valid in [('antigravity', True), ('../antigravity', False)]:
            with tempfile.TemporaryDirectory() as folder:
                output = io.BytesIO()
                with tarfile.open(fileobj=output, mode='w:gz') as archive:
                    member = tarfile.TarInfo(member_name)
                    member.size = 7
                    archive.addfile(member, io.BytesIO(b'program'))
                target = Path(folder) / 'bin/agy'
                if valid:
                    self.ns['install_agy_payload'](target, output.getvalue(), 'https://example.com/cli.tar.gz')
                    self.assertEqual(target.read_bytes(), b'program')
                else:
                    with self.assertRaisesRegex(RuntimeError, 'executable'):
                        self.ns['install_agy_payload'](target, output.getvalue(), 'https://example.com/cli.tar.gz')
                    self.assertFalse(target.exists())

    def test_agy_empty_download_does_not_overwrite_working_binary(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'agy'
            target.write_bytes(b'working')
            with self.assertRaisesRegex(RuntimeError, 'empty'):
                self.ns['install_agy_payload'](target, b'', 'https://example.com/agy')
            self.assertEqual(target.read_bytes(), b'working')
