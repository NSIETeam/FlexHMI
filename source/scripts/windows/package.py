from pathlib import Path
import subprocess,os
root=Path(__file__).resolve().parents[2];tools=root/'work/windows-tools';repo=root/'outputs/SimpleHMI'
for arch in ['x64','arm64']:
 stage=root/'work/windows-stage'/arch;un=tools/f'uninstall-{arch}.nsh'
 # Explicit per-file deletion preserves unrelated files in a user-selected folder.
 lines=['Delete "$INSTDIR\\'+str(p.relative_to(stage)).replace('/','\\')+'"' for p in stage.rglob('*') if p.is_file()]
 lines+=['RMDir "$INSTDIR\\'+str(p.relative_to(stage)).replace('/','\\')+'"' for p in sorted(stage.rglob('*'),key=lambda p:len(p.parts),reverse=True) if p.is_dir()]
 un.write_text('\n'.join(lines),encoding='utf-8')
 output=root/'outputs'/f'SimpleHMI-0.2.0-Windows-{arch}-Setup.exe'
 args=[str(tools/'nsis-bin/makensis'),'-V2',f'-DPAYLOAD={stage}',f'-DOUTPUT={output}',f'-DARCH={arch}',f'-DICON={repo}/desktop/icon.ico',f'-DLICENSEFILE={repo}/LICENSE',f'-DUNINSTALLFILES={un}',str(repo/'desktop/installer.nsi')]
 subprocess.run(args,env={**os.environ,'NSISDIR':str(tools/'nsis-bin')},check=True)
 print('PACKAGED',output,flush=True)
