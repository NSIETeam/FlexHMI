from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request,hashlib,zipfile
root=Path(__file__).resolve().parent
node='22.23.2'; electron='44.3.0'
tasks=[]
for arch in ['x64','arm64']:
 tasks.extend([(f'https://nodejs.org/dist/v{node}/',f'node-v{node}-win-{arch}.zip','SHASUMS256.txt'),(f'https://github.com/electron/electron/releases/download/v{electron}/',f'electron-v{electron}-win32-{arch}.zip','SHASUMS256.txt')])
def fetch(t):
 base,name,sums=t; path=root/name
 checks=urllib.request.urlopen(base+sums).read().decode();expected=next(l.split()[0] for l in checks.splitlines() if l.split()[-1].lstrip('*')==name)
 if not path.exists():urllib.request.urlretrieve(base+name,path)
 actual=hashlib.sha256(path.read_bytes()).hexdigest();assert actual==expected,(name,actual,expected)
 with zipfile.ZipFile(path) as z:z.extractall(root/name[:-4])
 print(name,actual,flush=True)
with ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(fetch,tasks))
