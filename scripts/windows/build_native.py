from pathlib import Path
import subprocess,tarfile,shutil
root=Path(__file__).resolve().parents[2]; tools=root/'work/windows-tools'; tool=next(tools.glob('llvm-mingw-*-macos-universal'))/'bin';mods=root/'outputs/SimpleHMI/server/node_modules';headers=tools/'node/node-v22.23.2/include/node';sql=mods/'sqlite3'
with tarfile.open(sql/'deps/sqlite-autoconf-3440200.tar.gz') as t:t.extractall(tools/'sqlite-src')
sqlsrc=tools/'sqlite-src/sqlite-autoconf-3440200'
for arch,triple in [('x64','x86_64'),('arm64','aarch64')]:
 out=tools/'native'/arch;out.mkdir(parents=True,exist_ok=True)
 cc=str(tool/(triple+'-w64-mingw32-clang'));cxx=cc+'++';lib=str(tools/'node'/('node-'+arch+'.lib'))
 def run(args):print(' '.join(map(str,args)),flush=True);subprocess.run(list(map(str,args)),check=True)
 run([cc,'-O2','-DSQLITE_THREADSAFE=1','-DSQLITE_ENABLE_FTS3','-DSQLITE_ENABLE_FTS5','-DSQLITE_ENABLE_RTREE','-DSQLITE_ENABLE_COLUMN_METADATA','-c',sqlsrc/'sqlite3.c','-o',out/'sqlite3.o'])
 run([cxx,'-shared','-O2','-static','-std=c++17','-DNAPI_VERSION=6','-DNAPI_DISABLE_CPP_EXCEPTIONS=1','-DNODE_GYP_MODULE_NAME=node_sqlite3','-I'+str(headers),'-I'+str(mods/'node-addon-api'),'-I'+str(sqlsrc),*sorted((sql/'src').glob('*.cc')),out/'sqlite3.o',lib,'-o',out/'node_sqlite3.node'])
 serial=tools/'serialport-src';shutil.copytree(mods/'@serialport/bindings-cpp/src',serial/'src',dirs_exist_ok=True)
 h=serial/'src/serialport_win.h';h.write_text(h.read_text().replace('#include <node_buffer.h>',''))
 c=serial/'src/serialport_win.cpp';c.write_text(c.read_text().replace('  v8::Local<v8::Value> argv[1];',''))
 run([cxx,'-shared','-O2','-static','-std=c++17','-DNAPI_CPP_EXCEPTIONS','-DWIN32','-D__in=','-D__out=','-D__out_opt=','-DNODE_GYP_MODULE_NAME=bindings','-I'+str(headers),'-I'+str(mods/'node-addon-api'),serial/'src/serialport.cpp',serial/'src/serialport_win.cpp',lib,'-lsetupapi','-ladvapi32','-lole32','-o',out/'serialport.node'])
print('Both native architectures compiled')
