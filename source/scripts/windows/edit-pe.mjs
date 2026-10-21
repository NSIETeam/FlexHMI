import * as PE from '../product-tools/node_modules/pe-library/dist/index.js';
import * as RE from '../product-tools/node_modules/resedit/dist/index.js';
import fs from 'node:fs';
const [file,ico]=process.argv.slice(2), exe=PE.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true}),res=PE.NtExecutableResource.from(exe);
const icons=RE.Data.IconFile.from(fs.readFileSync(ico)).icons.map(x=>x.data);
for(const group of RE.Resource.IconGroupEntry.fromEntries(res.entries))RE.Resource.IconGroupEntry.replaceIconsForResource(res.entries,group.id,group.lang,icons);
for(const vi of RE.Resource.VersionInfo.fromEntries(res.entries)){
 vi.setFileVersion(0,2,0,0,1033);vi.setProductVersion(0,2,0,0,1033);
 vi.setStringValues({lang:1033,codepage:1200},{FileDescription:'SimpleHMI',ProductName:'SimpleHMI',OriginalFilename:'SimpleHMI.exe',InternalName:'SimpleHMI',CompanyName:'SimpleHMI contributors'});vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);fs.writeFileSync(file,Buffer.from(exe.generate()));PE.NtExecutable.from(fs.readFileSync(file));
