#!/usr/bin/env bash
# capturePhase05Snapshot.sh — Phase 0.5.1 + 0.5.3 Windows OBS snapshot capture
#
# Captures Windows OBS host info (Phase 0.5.1) and file snapshots (Phase 0.5.3)
# in a single SSH session, since both phases need access to the same Windows host.
#
# Usage (from repo root):
#   scripts/capturePhase05Snapshot.sh <ssh-host> [<ssh-user>] [<scene-name>] [<obs-config-root>]
#
# Examples:
#   scripts/capturePhase05Snapshot.sh 192.168.13.21 derek SaT_Summer_2026
#   scripts/capturePhase05Snapshot.sh windowsbox.tail-something.ts.net derek SaT_Summer_2026
#
# Via npm — the '--' separator is REQUIRED to pass positional args through npm run:
#   npm run snapshot:phase05 -- 192.168.13.21 derek SaT_Summer_2026
#
# Prerequisites:
#   - OpenSSH server running on the Windows OBS host (built-in on Windows 10/11)
#   - SSH key auth configured for the Windows user (no password prompt)
#   - PowerShell available on the Windows host (standard on Windows 10+)
#   - Run from the repo root directory
#
# OBS install layout — the script auto-detects Scoop vs Standard:
#   Scoop:    %USERPROFILE%\scoop\persist\obs-studio\config\obs-studio\  (THIS USER's setup)
#   Standard: %APPDATA%\obs-studio\  (default OBS installer location)
# Pass an explicit <obs-config-root> as arg 4 to override the detection.
#
# scp + Windows-path gotcha:
#   scp's host separator is ':' which collides with the Windows drive-letter ':'.
#   This script uses `scp -O` (legacy SCP protocol) which handles it correctly.
#   If `scp -O` still fails for your environment, fall back to SSH-piped transport:
#     ssh user@host 'powershell -NoProfile -Command "Get-Content -Raw -Encoding utf8 <path>"' > local
#   (works for text/JSON, NOT for binary files like sources.db — for binaries, use SMB share.)
#
# Output artifacts:
#   obs-scene/SaT.snapshot.<ISO>.json                     — scene-collection JSON
#   obs-scene/source-switching/sources.db.snapshot-<ISO>  — live sources.db copy
#   docs/plugin-contract.md                               — host info + snapshot summary
#
# NOTE: docs/plugin-contract.md is (re)created fresh each run of this script.
# The Phase 0.5.2 latency measurement script (scripts/measureSwitcherLatency.ts)
# should APPEND its "Encoding contract" section to that file — NOT overwrite it —
# so both Phase 0.5.1/0.5.3 data and Phase 0.5.2 data coexist.
#
set -euo pipefail

HOST="${1:?usage: $0 <ssh-host> [<ssh-user>] [<scene-name>] [<obs-config-root>]}"
SSH_USER="${2:-${USER}}"
SCENE_NAME="${3:-SaT_Summer_2026}"
OBS_CONFIG_OVERRIDE="${4:-}"
ISO=$(date -u +%Y%m%dT%H%M%SZ)
SNAPSHOT_DIR="obs-scene"
DB_DIR="obs-scene/source-switching"

mkdir -p "$SNAPSHOT_DIR" "$DB_DIR" "docs"

echo "=== Phase 0.5 snapshot capture ==="
echo "Host:  $SSH_USER@$HOST"
echo "Scene: $SCENE_NAME"
echo "ISO:   $ISO"
echo ""

# ── [1/4] Scene collection JSON ──────────────────────────────────────────────
echo "[1/4] Copying scene collection JSON…"
# This user runs OBS via Scoop, so the config dir is under
# %USERPROFILE%\scoop\persist\obs-studio\config\obs-studio (NOT %APPDATA%).
# Pass arg 4 to override this default if your OBS install layout differs.
OBS_CONFIG="${OBS_CONFIG_OVERRIDE:-\$env:USERPROFILE\\scoop\\persist\\obs-studio\\config\\obs-studio}"
OBS_CONFIG=$(ssh "$SSH_USER@$HOST" \
  "powershell -NoProfile -Command \"Write-Output ${OBS_CONFIG}\"" \
  | tr -d '\r\n')
echo "  OBS config: $OBS_CONFIG"

# Convert Windows backslashes → forward slashes for the SCP remote path spec.
# Use -O (legacy SCP protocol) to handle the Windows-drive-letter colon
# correctly (scp's host separator is ':', which collides with 'C:').
SCENE_WIN="${OBS_CONFIG//\\//}/basic/scenes/${SCENE_NAME}.json"
echo "  Source: $SCENE_WIN"
scp -O "$SSH_USER@$HOST:'${SCENE_WIN}'" "$SNAPSHOT_DIR/${SCENE_NAME}.snapshot.${ISO}.json"
echo "  → $SNAPSHOT_DIR/${SCENE_NAME}.snapshot.${ISO}.json"
echo ""

# ── [2/4] sources.db (live) ──────────────────────────────────────────────────
echo "[2/4] Copying sources.db (live)…"
# Path: C:/OBS/source-switching/sources.db — matches the known repo layout.
# CAUTION: If OBS is running and actively writing, sources.db may be locked
# (SQLite WAL mode). If this step fails with a sharing/lock error, briefly
# stop OBS (or disable the source-switcher plugin), copy, then restart.
# The WAL files (sources.db-wal, sources.db-shm) are also worth grabbing if
# you need a fully consistent snapshot.
scp -O "$SSH_USER@$HOST:'C:/OBS/source-switching/sources.db'" \
  "$DB_DIR/sources.db.snapshot-${ISO}"
echo "  → $DB_DIR/sources.db.snapshot-${ISO}"
echo ""

# ── [3/4] Windows Node.js version ────────────────────────────────────────────
echo "[3/4] Recording Windows Node.js version…"
# 2>nul suppresses "node is not recognized" error on the Windows side if absent.
NODE_VERSION=$(ssh "$SSH_USER@$HOST" \
  "node --version 2>nul || echo NODE_NOT_INSTALLED" \
  | tr -d '\r\n')
echo "  Node version on Windows host: $NODE_VERSION"
echo ""

# ── [4/4] obs-source-switcher plugin location + version ──────────────────────
echo "[4/4] Locating obs-source-switcher plugin…"
# Scoop OBS plugin path. Edit if your install layout differs.
PLUGIN_INFO=$(ssh "$SSH_USER@$HOST" \
  "powershell -NoProfile -Command \"\
\$dll = \$env:USERPROFILE + '\\scoop\\persist\\obs-studio\\obs-plugins\\64bit\\source-switcher.dll'; \
Get-Item \$dll | Select-Object FullName, Length, LastWriteTime, \
  @{N='FileVersion';E={\$_.VersionInfo.FileVersion}}, \
  @{N='ProductVersion';E={\$_.VersionInfo.ProductVersion}} | Format-List\"" \
  | tr -d '\r')
echo "$PLUGIN_INFO"
echo ""

# ── Write docs/plugin-contract.md ────────────────────────────────────────────
PLUGIN_CONTRACT="docs/plugin-contract.md"
echo "Writing $PLUGIN_CONTRACT…"
{
  printf "# Plugin contract\n\n"
  printf "## Phase 0.5.1 — Windows OBS host info (captured %s)\n\n" "$ISO"
  printf "- SSH host: \`%s@%s\`\n" "$SSH_USER" "$HOST"
  printf "- Node.js: \`%s\`\n" "$NODE_VERSION"
  printf "- obs-source-switcher plugin:\n\n\`\`\`\n%s\n\`\`\`\n\n" "$PLUGIN_INFO"
  printf "## Phase 0.5.3 — Snapshots\n\n"
  printf "- Scene JSON: \`%s/SaT.snapshot.%s.json\`\n" "$SNAPSHOT_DIR" "$ISO"
  printf "- sources.db: \`%s/sources.db.snapshot-%s\`\n\n" "$DB_DIR" "$ISO"
  printf "## Phase 0.5.2 — Encoding contract (\`\${screen}.txt\` files)\n\n"
  printf "_TODO: filled in by \`scripts/measureSwitcherLatency.ts\` (Phase 0.5.2)._\n"
  printf "_That script must APPEND to this file — not overwrite — so this section coexists with the above._\n"
} > "$PLUGIN_CONTRACT"
echo "  → $PLUGIN_CONTRACT"
echo ""

echo "=== DONE ==="
echo "  Scene snapshot : $SNAPSHOT_DIR/SaT.snapshot.${ISO}.json"
echo "  DB snapshot    : $DB_DIR/sources.db.snapshot-${ISO}"
echo "  Summary        : $PLUGIN_CONTRACT"
echo ""
echo "Next steps:"
echo "  1. Run Phase 0.5.2: npx tsx scripts/measureSwitcherLatency.ts"
echo "     → it must APPEND to docs/plugin-contract.md (not overwrite)"
echo "  2. Commit Phase 0.5 artifacts when the full phase is complete"
echo "  3. Note: obs-scene/*.db.snapshot-* files are not excluded by .gitignore"
echo "     (only files/*.db is excluded) — commit them intentionally or add an"
echo "     exclusion rule to .gitignore if preferred"
