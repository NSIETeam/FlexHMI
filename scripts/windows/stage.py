from pathlib import Path
import shutil,json,urllib.request,tarfile,subprocess
root=Path(__file__).resolve().parents[2];tools=root/'work/windows-tools';repo=root/'outputs/SimpleHMI';mods=root/'work/windows-runtime/node_modules';stages=root/'work/windows-stage'
version='1.10.7';name='bcrypt-win32-x64-msvc';tgz=tools/(name+'.tgz')
if not tgz.exists():urllib.request.urlretrieve(f'https://registry.npmjs.org/@node-rs/{name}/-/{name}-{version}.tgz',tgz)
with tarfile.open(tgz) as t:
 dest=tools/name;dest.mkdir(exist_ok=True);t.extractall(dest,filter='data')
for arch in ['x64','arm64']:
 stage=stages/arch
 shutil.copytree(tools/f'electron-v44.3.0-win32-{arch}',stage,dirs_exist_ok=True)
 (stage/'electron.exe').rename(stage/'SimpleHMI.exe')
 default=stage/'resources/default_app.asar';default.unlink(missing_ok=True)
 shutil.copytree(repo/'desktop',stage/'resources/app',dirs_exist_ok=True)
 payload=stage/'resources/runtime';payload.mkdir(parents=True,exist_ok=True)
 shutil.copytree(repo/'server',payload/'server',ignore=shutil.ignore_patterns('node_modules','_appdata','_db','_logs','_pkg','.DS_Store'),dirs_exist_ok=True)
 shutil.copytree(mods,payload/'server/node_modules',dirs_exist_ok=True)
 pm=payload/'server/node_modules'
 for p in pm.rglob('*.node'):p.unlink()
 for p in (pm/'@node-rs').glob('bcrypt-win32-*'):shutil.rmtree(p)
 src=(tools/name/'package') if arch=='x64' else mods/'@node-rs/bcrypt-win32-arm64-msvc'
 shutil.copytree(src,pm/f'@node-rs/bcrypt-win32-{arch}-msvc')
 sql=pm/'sqlite3/build/Release';sql.mkdir(parents=True,exist_ok=True);shutil.copy2(tools/f'native/{arch}/node_sqlite3.node',sql/'node_sqlite3.node')
 serial=pm/f'@serialport/bindings-cpp/prebuilds/win32-{arch}';serial.mkdir(parents=True,exist_ok=True);shutil.copy2(tools/f'native/{arch}/serialport.node',serial/'node.napi.node')
 for source,target in [('simplehmi','simplehmi'),('client/dist','client/dist'),('desktop','desktop'),('docs/simplehmi','docs'),('examples','examples')]:shutil.copytree(repo/source,payload/target,dirs_exist_ok=True)
 for f in ['LICENSE','README.md','README.FUXA.md']:shutil.copy2(repo/f,payload/f)
 shutil.copytree(tools/f'node-v22.23.2-win-{arch}'/f'node-v22.23.2-win-{arch}',payload/'node',dirs_exist_ok=True)
 subprocess.run(['node',str(tools/'edit-pe.mjs'),str(stage/'SimpleHMI.exe'),str(repo/'desktop/icon.ico')],check=True)
 print('STAGED',arch,flush=True)
