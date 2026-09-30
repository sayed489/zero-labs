#!/usr/bin/env python3
"""Validate installed CLI command parsing; optionally probe unauthenticated startup.

Install binaries separately, then run:
  .venv/bin/python scripts/validate-clis.py --bin-dir /path/to/bin --probe --output /path/to/report.json

No account credentials are inherited. Probes use a fresh HOME/workspace, plan
mode and a 20-second deadline. Exit 2 means blocked/incomplete, not success.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bridge/overlay'))
import cli_launch

CLIS = {'claude': 'claude', 'codex': 'codex', 'cursor': 'agent', 'antigravity': 'agy', 'opencode': 'opencode', 'copilot': 'copilot'}
PROMPT = 'Reply OK only. Do not use tools or modify files.'


def run(cmd, env, cwd, timeout=20):
    proc = subprocess.Popen(cmd, env=env, cwd=cwd, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, start_new_session=os.name != 'nt')
    try:
        text, _ = proc.communicate(timeout=timeout)
        return proc.returncode, text
    except subprocess.TimeoutExpired:
        if os.name != 'nt':
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
        text, _ = proc.communicate()
        return None, text


def command(binary, name, cwd, mode='plan', session=''):
    if name == 'codex':
        # Extract the actual vendored prepare method rather than inventing a CLI.
        import ast
        import types
        source = ROOT / 'vendor/agent-remote/daemon/agentremoted/providers/codex.py'
        tree = ast.parse(source.read_text())
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'CodexRunner')
        method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'prepare')
        ns = {'os': os, 'providers': types.SimpleNamespace(RunnerError=RuntimeError)}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), 'exec'), ns)
        job = types.SimpleNamespace(cwd=str(cwd), runner_state={}, model='', session_id=session, prompt=PROMPT)
        runner = types.SimpleNamespace(config=types.SimpleNamespace(codex_bin=binary, codex_home_path=cwd / '.codex'))
        cmd, _ = ns['prepare'](runner, job, mode)
        return cli_launch.apply_codex_permission(cmd, mode)
    return cli_launch.build_headless_cmd(binary, PROMPT, flavor=name, permission_mode=mode, session_id=session)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bin-dir', type=Path, required=True)
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    results = []
    with tempfile.TemporaryDirectory(prefix='.forge-cli-validation-', dir=Path.home()) as folder:
        home = Path(folder)
        workspace = home / 'workspace'
        workspace.mkdir()
        (home / '.codex').mkdir()
        node = shutil.which('node')
        runtime_path = str(Path(node).parent) if node else ''
        env = {'PATH': os.pathsep.join([str(args.bin_dir), runtime_path, os.defpath]), 'HOME': str(home),
               'CODEX_HOME': str(home / '.codex'), 'XDG_CONFIG_HOME': str(home / '.config'),
               'CI': '1', 'NO_COLOR': '1'}
        for name, executable in CLIS.items():
            binary = shutil.which(executable, path=str(args.bin_dir))
            result = {'cli': name, 'status': 'blocked_missing', 'authenticated_agent_run': 'not_verified'}
            results.append(result)
            if not binary:
                continue
            code, text = run([binary, '--version'], env, workspace)
            result['version'] = next((line for line in text.splitlines() if any(ch.isdigit() for ch in line) and not line.startswith('WARNING:')), text.strip())[:200]
            if code != 0:
                result.update(status='failed_version', detail=text[-1000:])
                continue
            failures = []
            cases = 0
            for mode in ('plan', 'acceptEdits', 'bypassPermissions'):
                for session in ('', '00000000-0000-4000-8000-000000000001'):
                    cmd = command(binary, name, workspace, mode, session)
                    # Help parses flags but must never perform a model/tool run.
                    code, text = run(cmd + ['--help'], env, workspace)
                    cases += 1
                    if code != 0:
                        failures.append({'mode': mode, 'resumed': bool(session), 'exit_code': code, 'detail': text[-1000:]})
            result['parser_cases'] = cases
            if failures:
                result.update(status='failed_parser', failures=failures)
                continue
            result['status'] = 'parser_passed'
            if args.probe:
                cmd = command(binary, name, workspace)
                code, text = run(cmd, env, workspace)
                result['probe_exit_code'] = code
                result['probe_detail'] = text[-1800:]
                lower = text.lower()
                if any(term in lower for term in ('unexpected argument', 'unknown option', 'requires --verbose')):
                    result['status'] = 'failed_runtime_arguments'
                elif any(term in lower for term in ('tls', 'certificate', 'connection failed', 'network')):
                    result['status'] = 'blocked_network'
                elif any(term in lower for term in ('authentication', 'not logged in', 'please log in', 'api key')):
                    result['status'] = 'blocked_auth'
                elif code is None:
                    result['status'] = 'blocked_timeout'
                else:
                    result['status'] = 'probe_completed' if code == 0 else 'failed_probe'
    payload = json.dumps(results, indent=2) + '\n'
    if args.output:
        args.output.write_text(payload)
    print(payload)
    if any(item['status'].startswith('failed') for item in results):
        return 1
    if any(item['status'].startswith('blocked') for item in results):
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
