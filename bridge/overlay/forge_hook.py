"""Register Forge overlay providers without fragile string patches.

Called from the top of agentremoted/providers/__init__.py::build_one (the
installer inserts the call). Returning None leaves the vendored provider in charge. Codex failures must
propagate because its overlay is the permission enforcement boundary.
"""


def try_build(config, name):
    name = str(name or "").lower()
    if name == "codex":
        # This overlay enforces the requested sandbox. Fail closed if it
        # cannot load; falling back runs the upstream full-access default.
        from .codex_mode import build

        return build(config)
    if name in ("cursor", "agent", "cursor-agent"):
        from .cursor import CursorRunner, CursorStore

        return CursorStore(config), CursorRunner(config)
    if name in ("antigravity", "agy"):
        from .antigravity import AntigravityRunner, AntigravityStore

        return AntigravityStore(config), AntigravityRunner(config)
    if name in ("opencode", "open-code"):
        from .opencode import OpenCodeRunner, OpenCodeStore

        return OpenCodeStore(config), OpenCodeRunner(config)
    if name in ("copilot", "github", "gh", "github-copilot"):
        from .copilot import CopilotRunner, CopilotStore

        return CopilotStore(config), CopilotRunner(config)
    return None
