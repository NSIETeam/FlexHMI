"""Build a native WebKit .app and compressed DMG on the target Mac architecture.
Requires npm ci --omit=dev --prefix server and npm ci --prefix integrations/mcp.
Only tracked product source and the installed dependency trees are packaged.
"""
from pathlib import Path
import argparse, subprocess, shutil, json, hashlib, platform, plistlib, tarfile
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'release'))
from payload_policy import include_source, prune_development
p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--allow-dirty',action='store_true');a=p.parse_args()
r=Path(__file__).resolve().parents[2];work=a.work.resolve();out=a.out.resolve();work.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
arch='arm64' if platform.machine()=='arm64' else 'x64';target='arm64' if arch=='arm64' else 'x86_64'
version=json.loads((r/'package.json').read_text())['version'];commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip();dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=r,text=True).strip())
assert not dirty or a.allow_dirty, 'Commit source before release build'
app=work/'FlexHMI.app'
if app.exists():shutil.rmtree(app)
resources=app/'Contents/Resources';runtime=resources/'runtime';exes=app/'Contents/MacOS';exes.mkdir(parents=True);runtime.mkdir(parents=True)
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
def run(args,**kw):subprocess.run([str(x) for x in args],check=True,**kw)
def copy_tracked(src,dst):
 for name in filter(None,subprocess.check_output(['git','ls-files','-z','--',src],cwd=r).decode().split('\0')):
  if not include_source(name):continue
  rel=Path(name).relative_to(src);f=dst/rel;f.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(r/name,f)
for src,dst in [('server','server'),('simplehmi','simplehmi'),('client/dist','client/dist'),('examples','examples'),('docs/simplehmi','docs'),('integrations/mcp','integrations/mcp')]:copy_tracked(src,runtime/dst)
for folder in ['server','integrations/mcp']:
 assert (r/folder/'node_modules').is_dir(),f'Install {folder} dependencies first'
 shutil.copytree(r/folder/'node_modules',runtime/folder/'node_modules',symlinks=True)
dependency_policy={folder:prune_development(runtime/folder/'node_modules',r/folder/'package-lock.json') for folder in ['server','integrations/mcp']}
# Native password accelerator is optional; preserve the verified JS fallback.
mods=runtime/'server/node_modules'
for f in (mods/'@node-rs').glob('bcrypt*'):shutil.rmtree(f)
run(['node',r/'scripts/windows/check-password-fallback.cjs',mods])
# Serial binding contains a universal Darwin binary; other platform binaries cannot run here.
prebuilds=mods/'@serialport/bindings-cpp/prebuilds'
for f in prebuilds.iterdir():
 if f.name!='darwin-x64+arm64':shutil.rmtree(f)
brand=runtime/'simplehmi/assets/brand'
for f in brand.iterdir():
 if f.name not in ['app-icon-mono.png','README.md']:f.unlink()
for f in ['desktop/backend.cjs','desktop/ipc/launcher.cjs','LICENSE','README.FUXA.md','package.json']:
 dst=runtime/f;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(r/f,dst)
node_file=f'node-v22.23.2-darwin-{arch}.tar.gz';archive=work/node_file
expected={'arm64':'61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6','x64':'58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026'}[arch]
if not archive.exists():run(['curl','--fail','--location','--retry','3','--output',archive,'https://nodejs.org/dist/v22.23.2/'+node_file])
assert sha(archive)==expected,'Official Node archive checksum mismatch'
node_dir=work/f'node-v22.23.2-darwin-{arch}'
if not node_dir.exists():
 with tarfile.open(archive) as t:t.extractall(work,filter='data')
(runtime/'node').mkdir();shutil.copy2(node_dir/'bin/node',runtime/'node/node');shutil.copy2(node_dir/'LICENSE',runtime/'node/LICENSE')
run([runtime/'node/node','-e',f"const p={json.dumps(str(mods))};require(p+'/sqlite3');require(p+'/@serialport/bindings-cpp').autoDetect().list().then(x=>console.log('native dependencies loaded',process.arch,x.length)).catch(e=>{{console.error(e);process.exitCode=1}})"])
run(['xcrun','swiftc','-swift-version','5','-O','-target',target+'-apple-macos13.0',r/'desktop/macos/FlexHMI.swift','-o',exes/'FlexHMI','-framework','AppKit','-framework','WebKit'])
iconset=work/'FlexHMI.iconset';iconset.mkdir(exist_ok=True)
for n in [16,32,128,256,512]:
 for scale in [1,2]:
  name=f'icon_{n}x{n}'+('@2x' if scale==2 else '')+'.png'
  run(['sips','-z',n*scale,n*scale,r/'simplehmi/assets/brand/app-icon-mono.png','--out',iconset/name],stdout=subprocess.DEVNULL)
run(['iconutil','-c','icns',iconset,'-o',resources/'FlexHMI.icns'])
info={'CFBundleExecutable':'FlexHMI','CFBundleIdentifier':'com.nsiet.flexhmi','CFBundleName':'FlexHMI','CFBundleDisplayName':'FlexHMI','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':version,'CFBundleIconFile':'FlexHMI.icns','LSMinimumSystemVersion':'13.0','LSApplicationCategoryType':'public.app-category.productivity','NSHighResolutionCapable':True,'NSSupportsAutomaticTermination':False,'NSLocalNetworkUsageDescription':'FlexHMI 使用本地网络连接您配置的 PLC 和工业设备。','NSAppTransportSecurity':{'NSAllowsLocalNetworking':True,'NSExceptionDomains':{'127.0.0.1':{'NSExceptionAllowsInsecureHTTPLoads':True}}},'NSHumanReadableCopyright':'FlexHMI contributors; FUXA engine MIT copyright preserved.'}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
source_files={str(f.relative_to(runtime)):sha(f) for f in sorted(runtime.rglob('*')) if f.is_file() and 'node_modules' not in f.parts and 'node' not in f.relative_to(runtime).parts}
for f in [runtime/'node/node',*list(mods.rglob('*.node'))]:run(['codesign','--force','--sign','-',f],stdout=subprocess.DEVNULL)
manifest={'version':version,'platform':'darwin','arch':arch,'sourceCommit':commit,'sourceDirty':dirty,'nodeVersion':'22.23.2','nodeArchiveSHA256':expected,'serverLockSHA256':sha(r/'server/package-lock.json'),'sourceFiles':source_files,'mcpIncluded':True,'dependencyPolicy':dependency_policy,'documentation':'docs/DESKTOP.md','developerIdSigned':False,'notarized':False}
(runtime/'build-provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
run(['codesign','--force','--sign','-',app]);run(['codesign','--verify','--deep','--strict',app])
volume=work/'volume'
if volume.exists():shutil.rmtree(volume)
volume.mkdir();run(['ditto',app,volume/'FlexHMI.app']);(volume/'Applications').symlink_to('/Applications');shutil.copy2(r/'docs/simplehmi/MACOS.md',volume/'安装说明.md')
output=out/f'FlexHMI-{version}-macOS-{arch}.dmg'
if output.exists():output.unlink()
run(['hdiutil','create','-volname',f'FlexHMI {version}','-srcfolder',volume,'-ov','-format','UDZO',output])
record={'version':version,'platform':'darwin','arch':arch,'sourceCommit':commit,'sourceDirty':dirty,'file':output.name,'bytes':output.stat().st_size,'sha256':sha(output),'developerIdSigned':False,'notarized':False,'nodeArchiveSHA256':expected}
(out/f'build-{arch}.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
