#!/bin/bash
set -euo pipefail
image="$1"; arch="$2"; artifacts="$3"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$artifacts"; artifacts="$(cd "$artifacts" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/flex-mac-qa.XXXXXX")"
mount="$work/volume"; install="$work/应用 程序"; mkdir -p "$mount" "$install"
export FLEXHMI_DATA_DIR="$work/工程 数据"
export FLEXHMI_TARGET_ARCH="$arch"
export FLEXHMI_ACCEPTANCE_DIR="$artifacts"
app="$install/FlexHMI.app"; root="$app/Contents/Resources/runtime"; node="$root/node/node"; control="$root/desktop/ipc/launcher.cjs"
cleanup() {
 if [ -x "$node" ]; then "$node" "$control" --stop >/dev/null 2>&1 || true; fi
 hdiutil detach "$mount" -quiet >/dev/null 2>&1 || true
 rm -rf "$work"
}
trap cleanup EXIT
hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mount" -quiet
ditto "$mount/FlexHMI.app" "$app"
hdiutil detach "$mount" -quiet
codesign --verify --deep --strict "$app"
test "$("$node" -p process.arch)" = "$arch"
file "$app/Contents/MacOS/FlexHMI" | tee "$artifacts/native-binary.txt"
"$node" "$control" --ensure > "$artifacts/first-status.json"
"$node" "$repo/scripts/macos/installed-smoke.cjs" "$root" "$artifacts" "$arch" exercise
"$node" "$control" --ensure > "$artifacts/second-status.json"
"$node" -e 'const fs=require("fs"),a=require(process.argv[1]),b=require(process.argv[2]);if(a.instance!==b.instance||a.pid!==b.pid)throw Error("Second launch created a duplicate backend")' "$artifacts/first-status.json" "$artifacts/second-status.json"
"$node" "$control" --stop
"$node" "$control" --ensure >/dev/null
"$node" "$repo/scripts/macos/installed-smoke.cjs" "$root" "$artifacts" "$arch" restore
"$node" "$control" --stop
# Execute the actual signed native launcher and render both editor/runtime in WebKit.
"$app/Contents/MacOS/FlexHMI" --acceptance > "$artifacts/native-app.log" 2>&1 &
app_pid=$!
for i in $(seq 1 150); do
 if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
 sleep 1
done
if kill -0 "$app_pid" 2>/dev/null; then kill "$app_pid"; echo 'Native application did not exit within 150 seconds'; exit 1; fi
wait "$app_pid"
"$node" -e 'const a=require(process.argv[1]);if(!a.passed||!a.editorRendered||!a.runtimeEditingHidden)throw Error(JSON.stringify(a))' "$artifacts/native-webkit.json"
project_id="$("$node" -p 'require(process.argv[1]).projectId' "$artifacts/restore.json")"
project="$FLEXHMI_DATA_DIR/_appdata/simplehmi/$project_id.json"; before="$(shasum -a 256 "$project")"
# Replace the app from its original DMG and confirm data still loads in the new copy.
rm -rf "$app"
hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mount" -quiet
ditto "$mount/FlexHMI.app" "$app"
hdiutil detach "$mount" -quiet
"$node" "$control" --ensure >/dev/null
"$node" "$repo/scripts/macos/installed-smoke.cjs" "$root" "$artifacts" "$arch" restore
"$node" "$control" --stop
# Application deletion is the macOS uninstall path; it must preserve project files.
rm -rf "$app"
test -f "$project"
test "$(shasum -a 256 "$project")" = "$before"
python3 - "$artifacts" "$arch" <<'PY'
import json,sys,platform
from pathlib import Path
p=Path(sys.argv[1]);result={'platform':'darwin','arch':sys.argv[2],'macOS':platform.mac_ver()[0],'dmgMounted':True,'installedFromDmg':True,'signatureIntegrity':True,'nativeRuntime':True,'simulation':True,'mcp':True,'persistence':True,'singleInstance':True,'nativeWebKit':True,'upgrade':True,'uninstallPreservesData':True,'developerIdSigned':False,'notarized':False,'physicalHardwareTested':False};(p/'result.json').write_text(json.dumps(result,indent=2)+'\n');print('PASS macOS installed package',sys.argv[2])
PY
