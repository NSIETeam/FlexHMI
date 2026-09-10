"""Reproducible cross-build from already verified Windows Node/dependency caches.
python3 scripts/windows/build-ipc.py --tools /.../windows-tools --runtime-stage /.../windows-stage --work /.../ipc-build --out /.../outputs
No downloads. Native modules must have been built for each target architecture.
"""
from pathlib import Path
import argparse,shutil,subprocess,os,hashlib,json,struct
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--runtime-stage',type=Path,required=True);p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
r=Path(__file__).resolve().parents[2];tools=a.tools.resolve();work=a.work.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
compiler=tools/'llvm-mingw-20260908-ucrt-macos-universal/bin';report=[]
def machine(f):
 b=f.read_bytes();offset=struct.unpack_from('<I',b,0x3c)[0];assert b[offset:offset+4]==b'PE\0\0',str(f);return struct.unpack_from('<H',b,offset+4)[0]
for arch,target,expected in [('x64','x86_64',0x8664),('arm64','aarch64',0xaa64)]:
 stage=work/arch;stage.mkdir(parents=True,exist_ok=True)
 # Replace only generated stage directories; never project/user data.
 for name in ['server','node','client','simplehmi','desktop','examples','docs']:
  if (stage/name).exists():shutil.rmtree(stage/name)
 mods=a.runtime_stage/arch/'resources/runtime/server/node_modules'
 assert mods.is_dir(),f'Missing verified dependency cache: {mods}'
 shutil.copytree(r/'server',stage/'server',ignore=shutil.ignore_patterns('node_modules','_appdata','_db','_logs','_pkg','.DS_Store'))
 shutil.copytree(mods,stage/'server/node_modules',symlinks=True)
 # Node-RED officially falls back to bcryptjs. Remove only its optional accelerator,
 # whose VCRUNTIME140 dependency is not present on every clean industrial PC.
 pm=stage/'server/node_modules'
 for consumer in ['@node-red/editor-api/lib/auth/users.js','node-red/red.js','node-red-admin/lib/commands/hash.js','node-red-admin/lib/commands/init/index.js']:
  text=(pm/consumer).read_text();assert "catch(e) { bcrypt = require('bcryptjs'); }" in text,consumer
 for optional in (pm/'@node-rs').glob('bcrypt*'):shutil.rmtree(optional)
 subprocess.run(['node',str(r/'scripts/windows/check-password-fallback.cjs'),str(pm.resolve())],check=True)
 shutil.copytree(tools/f'node-v22.23.2-win-{arch}'/f'node-v22.23.2-win-{arch}',stage/'node')
 for src,dst in [('client/dist','client/dist'),('simplehmi','simplehmi'),('examples','examples'),('docs/simplehmi','docs')]:shutil.copytree(r/src,stage/dst)
 # Reference moodboards and superseded icons are development assets, not UI dependencies.
 brand=stage/'simplehmi/assets/brand'
 for f in brand.iterdir():
  if f.name not in ['app-icon-mono.png','README.md']:f.unlink()
 (stage/'desktop/ipc').mkdir(parents=True)
 for f in ['backend.cjs','icon.ico','verify-runtime.ps1']:shutil.copy2(r/'desktop'/f,stage/'desktop'/f)
 shutil.copy2(r/'desktop/ipc/launcher.cjs',stage/'desktop/ipc/launcher.cjs')
 for f in ['LICENSE','README.md','README.FUXA.md']:shutil.copy2(r/f,stage/f)
 rc=work/f'icon-{arch}.rc';rc.write_text(f'1 ICON "{r}/desktop/icon.ico"\n1 VERSIONINFO\nFILEVERSION 0,3,0,0\nPRODUCTVERSION 0,3,0,0\nBEGIN\n BLOCK "StringFileInfo"\n BEGIN\n BLOCK "040904b0"\n BEGIN\n VALUE "ProductName", "FlexHMI IPC\\0"\n VALUE "FileDescription", "FlexHMI Industrial PC Edition\\0"\n VALUE "FileVersion", "0.3.0\\0"\n END\n END\n BLOCK "VarFileInfo"\n BEGIN\n VALUE "Translation", 0x409, 1200\n END\nEND\n')
 obj=work/f'icon-{arch}.o'
 subprocess.run([str(compiler/f'{target}-w64-mingw32-windres'),str(rc),str(obj)],check=True)
 subprocess.run([str(compiler/f'{target}-w64-mingw32-clang'),'-Os','-s','-municode','-mwindows',str(r/'desktop/ipc/launcher.c'),str(obj),'-lshell32','-o',str(stage/'FlexHMI.exe')],check=True)
 for f in [stage/'FlexHMI.exe',stage/'node/node.exe',*list((stage/'server/node_modules').rglob('*.node'))]:assert machine(f)==expected,f'Wrong machine: {f}'
 # Explicit delete list preserves files not owned by this package.
 files=[f for f in stage.rglob('*') if f.is_file() or f.is_symlink()]
 lines=['Delete "$INSTDIR\\'+str(f.relative_to(stage)).replace('/','\\')+'"' for f in files]
 lines+=['RMDir "$INSTDIR\\'+str(f.relative_to(stage)).replace('/','\\')+'"' for f in sorted(stage.rglob('*'),key=lambda x:len(x.parts),reverse=True) if f.is_dir() and not f.is_symlink()]
 un=work/f'uninstall-{arch}.nsh';un.write_text('\n'.join(lines))
 output=out/f'FlexHMI-0.3.0-IPC-Windows-{arch}-Setup.exe'
 subprocess.run([str(tools/'nsis-bin/makensis'),'-V2',f'-DPAYLOAD={stage}',f'-DOUTPUT={output}',f'-DARCH={arch}',f'-DICON={r}/desktop/icon.ico',f'-DLICENSEFILE={r}/LICENSE',f'-DUNINSTALLFILES={un}',str(r/'desktop/ipc/installer.nsi')],env={**os.environ,'NSISDIR':str(tools/'nsis-bin')},check=True)
 record={'arch':arch,'file':output.name,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'unpackedBytes':sum(f.stat().st_size for f in files),'nativeMachine':hex(expected),'windowsRuntimeTested':False}
 report.append(record);print(json.dumps(record),flush=True)
(out/'FlexHMI-0.3.0-IPC-build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
