function safeShellUrl(value: string) {
  return value.replace(/['\r\n]/g, '')
}

export function installScript(origin: string, relayUrl: string) {
  const safeOrigin = safeShellUrl(origin)
  const safeRelay = safeShellUrl(relayUrl)
  return `#!/usr/bin/env bash
set -euo pipefail

ORIGIN='${safeOrigin}'
RELAY='${safeRelay}'
FORGE_HOME="\${HOME}/.forge"
mkdir -p "\$FORGE_HOME"

command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required."; exit 1; }

echo "→ installing secure WebSocket support"
if ! python3 -m venv "\$FORGE_HOME/venv"; then
  echo "Python venv support is required (on Debian/Ubuntu: install python3-venv)."
  exit 1
fi
"\$FORGE_HOME/venv/bin/python" -m pip install --disable-pip-version-check -q websocket-client

echo "→ requesting a one-time pairing code"
python3 - "\$RELAY" "\$FORGE_HOME" <<'PY'
import json, platform, socket, sys, time, urllib.error, urllib.request, webbrowser
from pathlib import Path
relay, home = sys.argv[1], Path(sys.argv[2])
def post(path, payload):
    req = urllib.request.Request(relay + path, data=json.dumps(payload).encode(), headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode())
pair = post("/v1/pair/start", {"name": socket.gethostname(), "platform": platform.system()})
print("\nPairing code: " + pair["userCode"])
print("Approve at: " + pair["verificationUriComplete"] + "\n")
try: webbrowser.open(pair["verificationUriComplete"])
except Exception: pass
deadline = time.time() + int(pair.get("expiresIn", 600))
while time.time() < deadline:
    time.sleep(max(2, int(pair.get("interval", 3))))
    try:
        result = post("/v1/pair/poll", {"deviceCode": pair["deviceCode"]})
        if result.get("status") == "approved":
            config = {"relayUrl": relay, "deviceId": result["deviceId"], "deviceToken": result["deviceToken"], "daemonUrl": "http://127.0.0.1:8473"}
            home.mkdir(parents=True, exist_ok=True)
            (home / "config.json").write_text(json.dumps(config, indent=2) + "\n")
            print("Pairing approved.")
            break
    except urllib.error.HTTPError as error:
        if error.code == 410: raise SystemExit("Pairing code expired. Run the installer again.")
else:
    raise SystemExit("Pairing timed out. Run the installer again.")
PY

curl -fsSL "\$ORIGIN/bridge.py" -o "\$FORGE_HOME/bridge.py"
chmod 700 "\$FORGE_HOME/bridge.py"

if command -v git >/dev/null 2>&1; then
  if [[ ! -d "\$FORGE_HOME/agent-remote/daemon" ]]; then
    echo "→ installing the loopback-only agent daemon"
    git clone --depth 1 https://github.com/jxw1102/agent-remote.git "\$FORGE_HOME/agent-remote"
  fi
  mkdir -p "\$HOME/.agentremoted"
  if [[ ! -f "\$HOME/.agentremoted/config.json" ]]; then
    printf '%s\n' '{"bind":"127.0.0.1","port":8473,"providers":["claude","codex"]}' > "\$HOME/.agentremoted/config.json"
  fi
else
  echo "git is not installed; install it later to add the local agent daemon."
fi

if [[ -f "\$HOME/.agentremoted/token" ]]; then
  python3 - "\$FORGE_HOME/config.json" "\$HOME/.agentremoted/token" <<'PY'
import json, sys
from pathlib import Path
config_path, token_path = map(Path, sys.argv[1:])
config = json.loads(config_path.read_text())
config["daemonToken"] = token_path.read_text().strip()
config_path.write_text(json.dumps(config, indent=2) + "\n")
PY
fi

cat > "\$FORGE_HOME/start.sh" <<'SH'
#!/usr/bin/env bash
FORGE_HOME="$HOME/.forge"
if [[ -d "$FORGE_HOME/agent-remote/daemon" ]] && ! curl -sf http://127.0.0.1:8473/api/ping >/dev/null 2>&1; then
  PYTHONPATH="$FORGE_HOME/agent-remote/daemon" python3 -m agentremoted --bind 127.0.0.1 --port 8473 >> "$FORGE_HOME/daemon.log" 2>&1 &
fi
exec "$FORGE_HOME/venv/bin/python" "$FORGE_HOME/bridge.py" >> "$FORGE_HOME/bridge.log" 2>&1
SH
chmod 700 "\$FORGE_HOME/start.sh"

if [[ "\$(uname -s)" == "Darwin" ]]; then
  PLIST="\$HOME/Library/LaunchAgents/app.forge.bridge.plist"
  mkdir -p "\$(dirname "\$PLIST")"
  cat > "\$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>app.forge.bridge</string><key>ProgramArguments</key><array><string>\$FORGE_HOME/start.sh</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>\$FORGE_HOME/service.log</string><key>StandardErrorPath</key><string>\$FORGE_HOME/service.log</string></dict></plist>
PLIST
  launchctl unload "\$PLIST" >/dev/null 2>&1 || true
  launchctl load "\$PLIST"
elif command -v systemctl >/dev/null 2>&1; then
  mkdir -p "\$HOME/.config/systemd/user"
  cat > "\$HOME/.config/systemd/user/forge-bridge.service" <<UNIT
[Unit]
Description=Forge outbound laptop bridge
After=network-online.target
[Service]
ExecStart=\$FORGE_HOME/start.sh
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now forge-bridge.service
else
  nohup "\$FORGE_HOME/start.sh" >/dev/null 2>&1 &
fi

echo
echo "Forge is installed and will reconnect automatically."
echo "Logs: \$FORGE_HOME/bridge.log"
`
}

export function windowsInstallScript(origin: string, relayUrl: string) {
  const safeOrigin = origin.replace(/['\r\n]/g, '')
  const safeRelay = relayUrl.replace(/['\r\n]/g, '')
  return `$ErrorActionPreference = 'Stop'
$Origin = '${safeOrigin}'
$Relay = '${safeRelay}'
$ForgeHome = Join-Path $HOME '.forge'
New-Item -ItemType Directory -Force -Path $ForgeHome | Out-Null

if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Python 3 is required.' }
Write-Host 'Installing secure WebSocket support...'
$Venv = Join-Path $ForgeHome 'venv'
py -m venv $Venv
$ForgePython = Join-Path $Venv 'Scripts\python.exe'
& $ForgePython -m pip install --disable-pip-version-check -q websocket-client

$PairBody = @{ name = $env:COMPUTERNAME; platform = 'Windows' } | ConvertTo-Json
$Pair = Invoke-RestMethod -Method Post -Uri "$Relay/v1/pair/start" -ContentType 'application/json' -Body $PairBody
Write-Host ''
Write-Host "Pairing code: $($Pair.userCode)"
Write-Host "Approve at: $($Pair.verificationUriComplete)"
Write-Host ''
Start-Process $Pair.verificationUriComplete
$Deadline = (Get-Date).AddSeconds($Pair.expiresIn)
do {
  Start-Sleep -Seconds ([Math]::Max(2, $Pair.interval))
  $Poll = Invoke-RestMethod -Method Post -Uri "$Relay/v1/pair/poll" -ContentType 'application/json' -Body (@{ deviceCode = $Pair.deviceCode } | ConvertTo-Json)
} while ($Poll.status -ne 'approved' -and (Get-Date) -lt $Deadline)
if ($Poll.status -ne 'approved') { throw 'Pairing timed out. Run the installer again.' }

$Config = @{ relayUrl = $Relay; deviceId = $Poll.deviceId; deviceToken = $Poll.deviceToken; daemonUrl = 'http://127.0.0.1:8473' }
$Config | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $ForgeHome 'config.json')
Invoke-WebRequest -UseBasicParsing "$Origin/bridge.py" -OutFile (Join-Path $ForgeHome 'bridge.py')

if (Get-Command git -ErrorAction SilentlyContinue) {
  $AgentHome = Join-Path $ForgeHome 'agent-remote'
  if (-not (Test-Path (Join-Path $AgentHome 'daemon'))) { git clone --depth 1 https://github.com/jxw1102/agent-remote.git $AgentHome }
  $DaemonHome = Join-Path $HOME '.agentremoted'
  New-Item -ItemType Directory -Force -Path $DaemonHome | Out-Null
  $DaemonConfig = Join-Path $DaemonHome 'config.json'
  if (-not (Test-Path $DaemonConfig)) { '{"bind":"127.0.0.1","port":8473,"providers":["claude","codex"]}' | Set-Content -Encoding UTF8 $DaemonConfig }
  $TokenPath = Join-Path $DaemonHome 'token'
  if (Test-Path $TokenPath) {
    $Config.daemonToken = (Get-Content -Raw $TokenPath).Trim()
    $Config | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $ForgeHome 'config.json')
  }
}

$StartScript = @'
$ForgeHome = Join-Path $HOME '.forge'
$AgentHome = Join-Path $ForgeHome 'agent-remote\daemon'
if (Test-Path $AgentHome) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8473/api/ping | Out-Null } catch {
    $env:PYTHONPATH = $AgentHome
    Start-Process -WindowStyle Hidden py -ArgumentList '-m','agentremoted','--bind','127.0.0.1','--port','8473'
  }
}
$ForgePython = Join-Path $ForgeHome 'venv\Scripts\python.exe'
Start-Process -WindowStyle Hidden $ForgePython -ArgumentList (Join-Path $ForgeHome 'bridge.py')
'@
$StartPath = Join-Path $ForgeHome 'start.ps1'
$StartScript | Set-Content -Encoding UTF8 $StartPath
$Startup = [Environment]::GetFolderPath('Startup')
('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $StartPath + '"') | Set-Content -Encoding ASCII (Join-Path $Startup 'Forge.cmd')
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartPath
Write-Host ''
Write-Host 'Forge is installed and will reconnect automatically.'
`
}
