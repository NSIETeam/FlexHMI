"""Verify built installer archives and compare their critical files with staged/source files.
This does not execute a Windows program and does not establish Windows runtime compatibility.
"""
from pathlib import Path
import argparse,subprocess,json,hashlib,struct
p=argparse.ArgumentParser();p.add_argument('--tools',type=Path,required=True);p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();tools=a.tools.resolve();work=a.work.resolve();out=a.out.resolve();repo=Path(__file__).resolve().parents[2];rows=[]
critical=['FlexHMI.exe','node/node.exe','desktop/ipc/launcher.cjs','simplehmi/index.html','simplehmi/app.js','simplehmi/topology.mjs','simplehmi/demo.json','simplehmi/assets/brand/app-icon-mono.png','server/simplehmi/knowledge.js','server/simplehmi/control.js','client/dist/index.html']
for arch,expected in [('x64',0x8664),('arm64',0xaa64)]:
 stage=work/arch;archive=out/f'FlexHMI-0.3.0-IPC-Windows-{arch}-Setup.exe';dest=work/f'verify-{arch}';dest.mkdir(exist_ok=True)
 subprocess.run([str(tools/'7zip/7zz'),'t',str(archive)],stdout=(work/f'archive-{arch}.log').open('w'),check=True)
 subprocess.run([str(tools/'7zip/7zz'),'x','-y',str(archive),'-o'+str(dest),*critical],stdout=subprocess.DEVNULL,check=True)
 checked=[]
 for rel in critical:
  f=dest/rel;assert f.read_bytes()==(stage/rel).read_bytes(),f'Archive differs: {rel}'
  source=repo/rel
  if source.is_file():assert f.read_bytes()==source.read_bytes(),f'Source differs: {rel}'
  checked.append({'file':rel,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 native=[]
 for f in [stage/'FlexHMI.exe',stage/'node/node.exe',*stage.rglob('*.node')]:
  b=f.read_bytes();o=struct.unpack_from('<I',b,0x3c)[0];assert b[o:o+4]==b'PE\0\0';machine=struct.unpack_from('<H',b,o+4)[0];assert machine==expected
  text=subprocess.check_output([str(tools/'llvm-mingw-20260908-ucrt-macos-universal/bin/llvm-readobj'),'--coff-imports',str(f)],text=True)
  imports=[x.strip()[6:] for x in text.splitlines() if x.strip().startswith('Name: ')]
  assert not any('vcruntime' in x.lower() or 'winpthread' in x.lower() or 'libc++' in x.lower() for x in imports),imports
  native.append({'file':str(f.relative_to(stage)),'machine':hex(machine),'imports':imports})
 assert not (stage/'server/node_modules/@node-rs/bcrypt').exists()
 assert 'FlexHMI' in (dest/'simplehmi/index.html').read_text()
 assert json.loads((dest/'simplehmi/demo.json').read_text())['simulation']=='water-transfer'
 listing=subprocess.check_output([str(tools/'7zip/7zz'),'l',str(archive)],text=True)
 assert 'client/dist/assets/images/logo.svg' not in listing
 rows.append({'arch':arch,'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archiveTest':'passed','criticalFiles':checked,'native':native,'windowsExecuted':False})
 print('PASS',arch,len(checked),'packaged file hashes;',len(native),'native PE/import checks',flush=True)
(out/'FlexHMI-0.3.0-IPC-verification.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
