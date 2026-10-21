from pathlib import Path
import struct,subprocess,json
root=Path(__file__).resolve().parents[2];tool=root/'work/windows-tools/llvm-mingw-20260908-ucrt-macos-universal/bin/llvm-readobj';results=[]
for arch,expected in [('x64',0x8664),('arm64',0xaa64)]:
 stage=root/'work/windows-stage'/arch
 files=[stage/'SimpleHMI.exe',stage/'resources/runtime/node/node.exe',*stage.rglob('*.node')]
 assert len(files)==5,files
 for f in files:
  b=f.read_bytes();offset=struct.unpack_from('<I',b,0x3c)[0];machine=struct.unpack_from('<H',b,offset+4)[0];assert machine==expected,(f,machine)
  out=subprocess.check_output([str(tool),'--coff-imports',str(f)],text=True)
  imports=[l.strip()[6:] for l in out.splitlines() if l.strip().startswith('Name: ')]
  assert not any('winpthread' in s or 'libc++' in s for s in imports),imports
  results.append({'arch':arch,'file':str(f.relative_to(stage)),'machine':hex(machine),'imports':imports})
(root/'outputs/SimpleHMI/docs/simplehmi/windows-pe-verification.json').write_text(json.dumps(results,indent=2))
print('PASS 10 PE architecture/import checks, x64 and ARM64')
