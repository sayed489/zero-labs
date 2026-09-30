from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

class ProviderSafetyTests(unittest.TestCase):
    def test_codex_overlay_failure_never_falls_back_to_full_access(self):
        source = Path(__file__).resolve().parents[1] / 'overlay/forge_hook.py'
        namespace = {'__package__': 'test_providers'}
        exec(compile(source.read_text(), str(source), 'exec'), namespace)
        module = types.ModuleType('test_providers.codex_mode')
        def broken(config):
            raise RuntimeError('overlay cannot enforce permissions')
        module.build = broken
        with patch.dict(sys.modules, {'test_providers.codex_mode': module}):
            with self.assertRaisesRegex(RuntimeError, 'permissions'):
                namespace['try_build'](object(), 'codex')
        self.assertIsNone(namespace['try_build'](object(), 'claude'))
