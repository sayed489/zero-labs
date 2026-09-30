"""Exercise the vendored response writer without starting the daemon."""
import ast
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[2] / 'vendor/agent-remote/daemon/agentremoted/server.py'

class DisconnectTests(unittest.TestCase):
    def test_cancel_during_headers_or_body(self):
        tree = ast.parse(SOURCE.read_text())
        method = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == '_send_json_bytes')
        ns = {}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(SOURCE), 'exec'), ns)
        for stage in ('end_headers', 'write'):
            for error in (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                with self.subTest(stage=stage, error=error):
                    class Handler:
                        close_connection = False
                        def send_response(self, status): pass
                        def send_header(self, *args): pass
                        def _cors_headers(self): pass
                        def end_headers(self):
                            if stage == 'end_headers': raise error()
                        def write(self, body):
                            if stage == 'write': raise error()
                    h = Handler()
                    h.wfile = h
                    ns['_send_json_bytes'](h, b'{}')
                    self.assertTrue(h.close_connection)
