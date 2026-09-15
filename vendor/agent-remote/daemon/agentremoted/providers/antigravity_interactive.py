"""Drive Google Antigravity's interactive-only CLI in a detached tmux pane."""

import hashlib
import json
import os
import shlex
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

from ..config import CONFIG_DIR, ensure_tmux_server, tmux_socket
from ..render_blocks import markdown_to_blocks

_TMUX_FALLBACK = "/opt/homebrew/bin/tmux"
_STATE_FILE = CONFIG_DIR / "antigravity-tuis.json"
_READY_MARKERS = (">", "Ask anything", "Type a message", "Antigravity")


def tmux_available():
    return bool(shutil.which("tmux")) or os.path.exists(_TMUX_FALLBACK)


class _Tui:
    def __init__(self, name, cwd, session_id=""):
        self.name = name
        self.cwd = cwd
        self.session_id = session_id
        self.job = None
        self.last_used = time.time()


class AntigravityInteractiveManager:
    def __init__(self, config, runner):
        self.config = config
        self.runner = runner
        self._lock = threading.Lock()
        self._tuis = {}
        self._load_state()

    @property
    def _tmux_bin(self):
        return shutil.which("tmux") or _TMUX_FALLBACK

    def _tmux(self, *args, capture=False, input_bytes=None):
        return subprocess.run([self._tmux_bin, "-L", tmux_socket(), *args],
                              input=input_bytes,
                              stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                              stderr=subprocess.PIPE, timeout=15)

    def _alive(self, name):
        try:
            return self._tmux("has-session", "-t", name).returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def _pane(self, name, ansi=False):
        args = ["capture-pane", "-p", "-J"]
        if ansi:
            args.append("-e")
        args += ["-t", name]
        try:
            return self._tmux(*args, capture=True).stdout.decode("utf-8", errors="replace")
        except (OSError, subprocess.SubprocessError):
            return ""

    def _settings_path(self):
        configured = str(getattr(self.config, "antigravity_settings_path", "") or "").strip()
        return Path(configured).expanduser() if configured else Path.home() / ".config" / "antigravity" / "settings.json"

    def _write_full_control_settings(self):
        path = self._settings_path()
        try:
            current = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
            if not isinstance(current, dict):
                current = {}
        except (OSError, ValueError):
            current = {}
        current.update({
            "toolPermission": "always-proceed",
            "artifactReviewPolicy": "always-proceed",
            "allowNonWorkspaceAccess": True,
            "enableTerminalSandbox": False,
            "altScreenMode": "never",
        })
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")

    def _load_state(self):
        try:
            rows = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            rows = []
        for row in rows if isinstance(rows, list) else []:
            name = str(row.get("name") or "")
            if name.startswith("agy-") and self._alive(name):
                tui = _Tui(name, str(row.get("cwd") or Path.home()),
                           str(row.get("session_id") or ""))
                self._tuis[tui.session_id] = tui

    def _save_state(self):
        rows = [{"name": tui.name, "cwd": tui.cwd,
                 "session_id": tui.session_id, "last_used": tui.last_used}
                for tui in self._tuis.values() if self._alive(tui.name)]
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            _STATE_FILE.write_text(json.dumps(rows), encoding="utf-8")
        except OSError:
            pass

    def _launch(self, cwd, session_id):
        self._write_full_control_settings()
        name = "agy-%s-%s" % (hashlib.sha1(cwd.encode()).hexdigest()[:8], uuid.uuid4().hex[:6])
        binary = str(getattr(self.config, "antigravity_bin", "agy") or "agy")
        env = dict(os.environ)
        env.update({str(k): str(v) for k, v in
                    (getattr(self.config, "antigravity_env", None) or {}).items()})
        env["PATH"] = ":".join([str(Path.home() / ".local" / "bin"),
                                "/opt/homebrew/bin", "/usr/local/bin", env.get("PATH", "")])
        exported = " ".join("%s=%s" % (key, shlex.quote(value))
                            for key, value in env.items()
                            if key == "PATH" or key in (getattr(self.config, "antigravity_env", None) or {}))
        command = "%s exec %s" % (exported, shlex.quote(binary))
        ensure_tmux_server(self._tmux_bin)
        result = self._tmux("new-session", "-d", "-s", name, "-x", "220", "-y", "50",
                            "-c", cwd, command)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode("utf-8", errors="replace").strip() or "tmux failed")
        tui = _Tui(name, cwd, session_id or uuid.uuid4().hex)
        self._tuis[tui.session_id] = tui
        self._save_state()
        deadline = time.time() + 90
        while time.time() < deadline and self._alive(name):
            pane = self._pane(name)
            if any(marker in pane for marker in _READY_MARKERS):
                return tui
            time.sleep(0.3)
        raise RuntimeError("Antigravity TUI did not become ready")

    def _get_tui(self, session_id, cwd):
        with self._lock:
            tui = self._tuis.get(session_id) if session_id else None
            if tui and self._alive(tui.name):
                return tui
            return self._launch(cwd, session_id)

    def _submit(self, tui, text):
        self._tmux("load-buffer", "-", input_bytes=text.encode("utf-8"))
        self._tmux("paste-buffer", "-d", "-t", tui.name)
        time.sleep(0.15)
        self._tmux("send-keys", "-t", tui.name, "Enter")

    @staticmethod
    def _tail(text, lines=14):
        rows = [line.rstrip() for line in text.splitlines() if line.strip()]
        return "\n".join(rows[-lines:])

    def run(self, job):
        cwd = os.path.expanduser(job.cwd or getattr(
            self.config, "antigravity_default_cwd", "") or str(Path.home()))
        if not os.path.isdir(cwd):
            raise RuntimeError("cwd does not exist: %s" % cwd)
        job.cwd = cwd
        tui = self._get_tui(job.session_id, cwd)
        tui.job = job
        tui.last_used = time.time()
        job.tui_name = tui.name
        job.new_session_id = tui.session_id
        job.add_event("init", session_id=tui.session_id, model="antigravity")
        with job.lock:
            job.status = "running"
        before = self._pane(tui.name)
        self._submit(tui, job.prompt)
        job.set_phase("thinking", "Antigravity is working")
        started = time.time()
        deadline = started + float(getattr(self.config, "turn_timeout", 1800) or 1800)
        last = before
        last_change = time.time()
        last_emitted = ""
        changed = False
        while time.time() < deadline:
            if not self._alive(tui.name):
                raise RuntimeError("Antigravity TUI exited mid-turn")
            with job.lock:
                if job.status == "stopped":
                    return
            pane = self._pane(tui.name)
            if pane != last:
                changed = True
                last = pane
                last_change = time.time()
                tail = self._tail(pane)
                if tail and tail != last_emitted:
                    last_emitted = tail
                    job.set_phase("writing", tail[-200:])
            quiet = time.time() - last_change
            bottom = "\n".join(last.splitlines()[-6:])
            ready = any(marker in bottom for marker in _READY_MARKERS)
            if changed and quiet >= (3.0 if ready else 8.0) and time.time() - started > 3.0:
                break
            time.sleep(0.4)
        else:
            raise RuntimeError("Antigravity turn timed out")
        result = self._tail(last, 24)
        if result:
            job.add_event("text", text=result, blocks=markdown_to_blocks(result))
        with job.lock:
            job.result_text = result
            job.status = "done"
        job.add_event("result", is_error=False, duration_ms=int((time.time() - started) * 1000), cost_usd=0)
        tui.job = None
        self._save_state()

    def resume(self, job):
        self.run(job)

    def active_tui_status(self):
        rows = []
        for tui in list(self._tuis.values()):
            if not self._alive(tui.name):
                continue
            job = tui.job
            rows.append({"job_id": job.id if job else "", "session_id": tui.session_id,
                         "new_session_id": tui.session_id,
                         "status": job.status if job else "idle", "provider": "antigravity"})
        return rows

    def type_text(self, session_id, text):
        tui = self._tuis.get(session_id)
        if not tui or not self._alive(tui.name):
            return "Antigravity TUI is not running"
        self._tmux("load-buffer", "-", input_bytes=str(text).encode("utf-8"))
        self._tmux("paste-buffer", "-d", "-t", tui.name)
        return ""

    def capture_tui(self, session_id, ansi=False):
        tui = self._tuis.get(session_id)
        if not tui or not self._alive(tui.name):
            return {"error": "Antigravity TUI is not running"}
        return {"session_id": session_id, "text": self._pane(tui.name, ansi=ansi),
                "ansi": bool(ansi), "provider": "antigravity"}

    def send_tui_keys(self, session_id, keys=None, text=""):
        tui = self._tuis.get(session_id)
        if not tui or not self._alive(tui.name):
            return "Antigravity TUI is not running"
        if text:
            error = self.type_text(session_id, text)
            if error:
                return error
        if keys:
            self._tmux("send-keys", "-t", tui.name, *[str(key) for key in keys])
        return ""
