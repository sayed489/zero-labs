"""Test the Python actually served by the TypeScript installer generator."""
import ast
import json
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
            original = subprocess.check_output([
                'git', 'show', 'd1b9a779525e7479769bfc7516d332affbbc6375:vendor/agent-remote/daemon/agentremoted/server.py',
            ], cwd=ROOT, text=True)
            server.write_text(original)
            with patch.dict(self.ns, AGENT_HOME=home, download=Mock()):
                self.ns['overlay_daemon']()
                first = server.read_text()
                self.ns['overlay_daemon']()
                self.assertEqual(server.read_text(), first)
            ast.parse(first)
            self.assertIn('except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)', first)
            self.assertIn('refresh_cli_bins', first)
