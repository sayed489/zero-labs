"""Cursor Agent provider using the CLI's native stream-json protocol."""

import json
import os
import shutil
import threading
from pathlib import Path

from .. import providers
from ..render_blocks import markdown_to_blocks


def _text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("text") or value.get("content") or "")
    if isinstance(value, list):
        return "".join(_text(item) for item in value)
    return ""


class CursorStore:
    """Cursor does not currently publish a stable transcript-store schema."""

    def __init__(self, _home, config=None):
        self.config = config
        self.titler = None

    def list_projects(self):
        return []

    def list_sessions(self, project_id=None, limit=25, user_only=True):
        return []

    def search_sessions(self, query, project_id=None, limit=25, user_only=True):
        return []

    def iter_search_sessions(self, query, project_id=None, limit=25, user_only=True):
        return iter(())

    def get_session(self, session_id):
        return None

    def get_messages(self, session_id, offset=None, limit=50):
        return None


class CursorRunner:
    name = "cursor"

    def __init__(self, config):
        self.config = config

    def capabilities(self):
        return {
            "queue": True, "stop": True, "projects": True, "ws_status": True,
            "permissions": False, "permission_modes": False,
            "requires_cwd": True, "can_set_model": True,
            "can_set_effort": False, "can_show_usage": False,
            "turns": True, "interactive": False, "live_tui": False,
            "rewind": False,
        }

    def auth_health(self):
        binary = str(getattr(self.config, "cursor_bin", "cursor-agent") or "cursor-agent")
        on_path = bool(shutil.which(binary))
        auth_home = Path(getattr(self.config, "cursor_home_path", Path.home() / ".cursor"))
        has_auth = auth_home.exists()
        status = "ok" if on_path and has_auth else ("warning" if on_path else "missing")
        detail = "Cursor Agent is ready" if status == "ok" else (
            "Cursor Agent found; sign in with `cursor-agent login`" if on_path
            else "`cursor-agent` is not on PATH")
        return {"cli": "cursor-agent", "cli_on_path": on_path,
                "mode": "cursor", "status": status, "detail": detail}

    def slash_commands(self):
        return ["/compact"]

    def models(self):
        return list(getattr(self.config, "models", None) or [])

    def title_for(self, text):
        return ""

    def prepare(self, job, mode):
        del mode
        cwd = os.path.expanduser(job.cwd or getattr(
            self.config, "cursor_default_cwd", "") or str(Path.home()))
        if not os.path.isdir(cwd):
            raise providers.RunnerError("cwd does not exist: %s" % cwd)
        job.cwd = cwd
        job.runner_state["parts"] = []
        binary = str(getattr(self.config, "cursor_bin", "cursor-agent") or "cursor-agent")
        cmd = [binary, "--print", "--output-format", "stream-json", "--force", "--trust"]
        if job.session_id:
            cmd += ["--resume", job.session_id]
        if job.model and job.model not in ("", "default"):
            cmd += ["--model", job.model]
        cmd.append(job.prompt)
        env = dict(os.environ)
        env.update({str(k): str(v) for k, v in
                    (getattr(self.config, "cursor_env", None) or {}).items()})
        return cmd, env

    def handle_stream_line(self, job, line):
        try:
            obj = json.loads(line)
        except (ValueError, json.JSONDecodeError):
            return
        if not isinstance(obj, dict):
            return
        event_type = str(obj.get("type") or "")
        subtype = str(obj.get("subtype") or "")
        if event_type == "system" and subtype == "init":
            sid = str(obj.get("session_id") or "")
            if sid:
                job.new_session_id = sid
            job.add_event("init", session_id=sid, model=obj.get("model") or "")
            job.set_phase("thinking", "")
            return
        if event_type == "assistant":
            message = obj.get("message") if isinstance(obj.get("message"), dict) else obj
            content = message.get("content") if isinstance(message, dict) else ""
            blocks = content if isinstance(content, list) else [content]
            for block in blocks:
                text = _text(block).strip()
                if text:
                    job.runner_state["parts"].append(text)
                    job.add_event("text", text=text, blocks=markdown_to_blocks(text))
                    job.set_phase("writing", text[-160:])
            return
        if event_type == "tool_call":
            call = obj.get("tool_call") if isinstance(obj.get("tool_call"), dict) else obj
            name = str(call.get("name") or call.get("tool") or "tool")
            args = call.get("arguments") or call.get("args") or call.get("input") or ""
            detail = json.dumps(args, ensure_ascii=False) if isinstance(args, (dict, list)) else str(args)
            if subtype != "completed":
                job.add_event("tool", name=name, detail=detail[:280])
            job.set_phase("tool", (detail or name)[:160])
            return
        if event_type == "result":
            result = _text(obj.get("result") or obj.get("message") or "").strip()
            if result and not job.runner_state["parts"]:
                job.runner_state["parts"].append(result)
                job.add_event("text", text=result, blocks=markdown_to_blocks(result))
            with job.lock:
                job.result_text = "\n".join(job.runner_state["parts"]) or result
                if obj.get("is_error"):
                    job.error = job.result_text or "Cursor Agent reported an error"
            job.add_event("result", is_error=bool(obj.get("is_error")),
                          duration_ms=obj.get("duration_ms", 0), cost_usd=0)

    def tick(self, job):
        pass

    def finalize(self, job, returncode, stderr_tail):
        with job.lock:
            if not job.result_text:
                job.result_text = "\n".join(job.runner_state.get("parts") or [])
            if returncode not in (0, None) and not job.error:
                job.error = (stderr_tail or "").strip() or "Cursor Agent exited with code %s" % returncode
        return None

    def cleanup(self, job):
        pass

    def type_into_tui(self, session_id, text):
        return "Cursor uses native streaming, not a live TUI"

    def capture_tui(self, session_id, *, ansi=False):
        return {"error": "Cursor uses native streaming, not a live TUI"}

    def send_tui_keys(self, session_id, keys=None, text=""):
        return "Cursor uses native streaming, not a live TUI"


__all__ = ["CursorRunner", "CursorStore"]
