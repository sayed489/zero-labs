"""Google Antigravity provider backed by its interactive tmux TUI."""

import os
import shutil
import threading
from pathlib import Path

from .. import providers


class AntigravityStore:
    """Best-effort store; Antigravity does not expose a stable transcript API."""

    def __init__(self, _home, config=None):
        self.config = config
        self.titler = None

    def list_projects(self): return []
    def list_sessions(self, project_id=None, limit=25, user_only=True): return []
    def search_sessions(self, query, project_id=None, limit=25, user_only=True): return []
    def iter_search_sessions(self, query, project_id=None, limit=25, user_only=True): return iter(())
    def get_session(self, session_id): return None
    def get_messages(self, session_id, offset=None, limit=50): return None


class AntigravityRunner:
    name = "antigravity"

    def __init__(self, config):
        self.config = config
        self._interactive = None
        self._interactive_lock = threading.Lock()

    def _interactive_mgr(self):
        with self._interactive_lock:
            if self._interactive is None:
                from .antigravity_interactive import AntigravityInteractiveManager
                self._interactive = AntigravityInteractiveManager(self.config, self)
            return self._interactive

    def run_alternate(self, job, mode):
        del mode
        self._interactive_mgr().run(job)
        return True

    def resume_alternate(self, job):
        self._interactive_mgr().resume(job)

    def capabilities(self):
        from .antigravity_interactive import tmux_available
        available = tmux_available()
        return {
            "queue": True, "stop": True, "projects": True, "ws_status": True,
            "permissions": False, "permission_modes": False,
            "requires_cwd": True, "can_set_model": False,
            "can_set_effort": False, "can_show_usage": False,
            "turns": True, "interactive": available, "live_tui": available,
            "rewind": False,
        }

    def auth_health(self):
        binary = str(getattr(self.config, "antigravity_bin", "agy") or "agy")
        on_path = bool(shutil.which(binary)) or Path(binary).expanduser().is_file()
        return {"cli": "agy", "cli_on_path": on_path, "mode": "interactive",
                "status": "ok" if on_path else "missing",
                "detail": "Antigravity TUI is ready" if on_path else "`agy` is not on PATH"}

    def slash_commands(self): return ["/resume", "/fork", "/usage"]
    def models(self): return []
    def title_for(self, text): return ""

    def prepare(self, job, mode):
        raise providers.RunnerError("Antigravity requires its interactive tmux adapter")

    def handle_stream_line(self, job, line): pass
    def tick(self, job): pass
    def finalize(self, job, returncode, stderr_tail): return None
    def cleanup(self, job): pass

    def type_into_tui(self, session_id, text):
        return self._interactive_mgr().type_text(session_id, text)

    def capture_tui(self, session_id, *, ansi=False):
        return self._interactive_mgr().capture_tui(session_id, ansi=ansi)

    def send_tui_keys(self, session_id, keys=None, text=""):
        return self._interactive_mgr().send_tui_keys(session_id, keys=keys, text=text)


__all__ = ["AntigravityRunner", "AntigravityStore"]
