"""Stage current source + verified native dependencies as Windows payload ZIPs.
Installers must be compiled on Windows with scripts/windows/build-payload.ps1.
The former mixed macOS compiler / Windows stub route is deliberately removed.
"""
from pathlib import Path
import argparse, shutil, subprocess, hashlib, json, struct, zipfile
p=argparse.ArgumentParser()
for flag in ['tools','runtime-stage','work','out']: p.add_argument('--'+flag,type=Path,required=True)
a=p.parse_args(); r=Path(__file__).resolve().parents[2]
tools=a.tools.resolve(); work=a.work.resolve(); out=a.out.resolve()
work.mkdir(parents=True,exist_ok=True); out.mkdir(parents=True,exist_ok=True)
version=json.loads((r/'package.json').read_text())['version']
assert len(version.split('.'))==3 and all(x.isdigit() for x in version.split('.')), 'Use a numeric package version'
assert not subprocess.check_output(['git','status','--porcelain'],cwd=r,text=True).strip(), 'Commit source before staging a release'
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip()
compiler=tools/'llvm-mingw-20260908-ucrt-macos-universal/bin'; report=[]
def sha(f): return hashlib.sha256(f.read_bytes()).hexdigest()
def copy_tracked(src,dst):
 files=subprocess.check_output(['git','ls-files','-z','--',src],cwd=r).decode().split('\0')
 for name in filter(None,files):
  rel=Path(name).relative_to(src); target=dst/rel
  target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(r/name,target)
def machine(f):
 b=f.read_bytes(); offset=struct.unpack_from('<I',b,0x3c)[0]
 assert b[offset:offset+4]==b'PE\0\0',str(f)
 return struct.unpack_from('<H',b,offset+4)[0]
for arch,target,expected in [('x64','x86_64',0x8664),('arm64','aarch64',0xaa64)]:
 stage=work/arch
 if stage.exists(): shutil.rmtree(stage)
 stage.mkdir()
 native=a.runtime_stage/arch/'resources/runtime/server'; mods=native/'node_modules'
 assert mods.is_dir(),f'Missing verified dependency cache: {mods}'
 assert sha(native/'package-lock.json')==sha(r/'server/package-lock.json'), 'Dependency cache differs from source lockfile'
 copy_tracked('server',stage/'server')
 shutil.copytree(mods,stage/'server/node_modules',symlinks=True)
 pm=stage/'server/node_modules'
 for consumer in ['@node-red/editor-api/lib/auth/users.js','node-red/red.js','node-red-admin/lib/commands/hash.js','node-red-admin/lib/commands/init/index.js']:
  assert "catch(e) { bcrypt = require('bcryptjs'); }" in (pm/consumer).read_text(),consumer
 for optional in (pm/'@node-rs').glob('bcrypt*'): shutil.rmtree(optional)
 subprocess.run(['node',str(r/'scripts/windows/check-password-fallback.cjs'),str(pm)],check=True)
 (stage/'node').mkdir()
 node=tools/f'node-v22.23.2-win-{arch}'/f'node-v22.23.2-win-{arch}'
 for name in ['node.exe','LICENSE']: shutil.copy2(node/name,stage/'node'/name)
 for src,dst in [('client/dist','client/dist'),('simplehmi','simplehmi'),('examples','examples'),('docs/simplehmi','docs'),('integrations/mcp','integrations/mcp')]:
  copy_tracked(src,stage/dst)
 shutil.copytree(r/'integrations/mcp/node_modules',stage/'integrations/mcp/node_modules',symlinks=True)
 assert (stage/'integrations/mcp/node_modules/@modelcontextprotocol/sdk/package.json').is_file(), 'Install MCP dependencies before staging'
 assert not list((stage/'integrations/mcp/node_modules').rglob('*.node')), 'MCP dependencies must remain architecture independent'
 brand=stage/'simplehmi/assets/brand'
 for f in brand.iterdir():
  if f.name not in ['app-icon-mono.png','README.md']: f.unlink()
 (stage/'desktop/ipc').mkdir(parents=True)
 for f in ['backend.cjs','icon.ico','verify-runtime.ps1']: shutil.copy2(r/'desktop'/f,stage/'desktop'/f)
 shutil.copy2(r/'desktop/ipc/launcher.cjs',stage/'desktop/ipc/launcher.cjs')
 for f in ['LICENSE','README.md','README.FUXA.md','package.json']: shutil.copy2(r/f,stage/f)
 # Capture every packaged first-party source file, excluding dependency caches.
 source_files={str(f.relative_to(stage)).replace('\\','/'):sha(f) for f in sorted(stage.rglob('*')) if f.is_file() and 'node_modules' not in f.parts and 'node' not in f.relative_to(stage).parts}
 rc=work/f'icon-{arch}.rc'
 rc.write_text(f'1 ICON "{r}/desktop/icon.ico"\n1 VERSIONINFO\nFILEVERSION {version.replace(".",",")},0\nPRODUCTVERSION {version.replace(".",",")},0\nBEGIN\n BLOCK "StringFileInfo"\n BEGIN\n BLOCK "040904b0"\n BEGIN\n VALUE "ProductName", "FlexHMI IPC\\0"\n VALUE "FileDescription", "FlexHMI Industrial PC Edition\\0"\n VALUE "FileVersion", "{version}\\0"\n END\n END\n BLOCK "VarFileInfo"\n BEGIN\n VALUE "Translation", 0x409, 1200\n END\nEND\n')
 obj=work/f'icon-{arch}.o'
 subprocess.run([str(compiler/f'{target}-w64-mingw32-windres'),str(rc),str(obj)],check=True)
 subprocess.run([str(compiler/f'{target}-w64-mingw32-clang'),'-Os','-s','-municode','-mwindows',str(r/'desktop/ipc/launcher.c'),str(obj),'-lshell32','-o',str(stage/'FlexHMI.exe')],check=True)
 for f in [stage/'FlexHMI.exe',stage/'node/node.exe',*list((stage/'server/node_modules').rglob('*.node'))]: assert machine(f)==expected,f'Wrong machine: {f}'
 manifest={'version':version,'arch':arch,'sourceCommit':commit,'nodeVersion':'22.23.2','serverLockSHA256':sha(r/'server/package-lock.json'),'sourceFiles':source_files,'nativeLauncherSHA256':sha(stage/'FlexHMI.exe'),'nodeSHA256':sha(stage/'node/node.exe'),'mcpIncluded':True}
 (stage/'build-provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 output=out/f'FlexHMI-{version}-IPC-Windows-{arch}-Payload.zip'
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for f in sorted(stage.rglob('*')):
   if f.is_file(): z.write(f,f.relative_to(stage))
 record={'arch':arch,'version':version,'sourceCommit':commit,'file':output.name,'bytes':output.stat().st_size,'sha256':sha(output),'unpackedBytes':sum(f.stat().st_size for f in stage.rglob('*') if f.is_file()),'nativeMachine':hex(expected),'windowsRuntimeTested':False,'type':'payload-zip-not-installer'}
 report.append(record); print(json.dumps(record),flush=True)
(out/f'FlexHMI-{version}-IPC-payloads.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
