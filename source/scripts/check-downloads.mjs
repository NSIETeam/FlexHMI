import fs from 'node:fs';
import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/downloads.json',import.meta.url)));
assert.deepEqual(manifest.releases.map(r=>r.platform).sort(),['macos','windows']);
for(const release of manifest.releases){
assert.equal(release.qualified,true,'Do not publish a download release before qualification');
assert.match(release.sourceCommit,/^[0-9a-f]{40}$/);
assert.equal(release.packages.length,2);
assert.deepEqual(release.packages.map(p=>p.arch).sort(),['arm64','x64']);
assert.ok(Date.parse(release.publishedAt));
const publicRelease=await fetch(release.releaseUrl.replace('https://github.com/','https://api.github.com/repos/').replace('/releases/tag/','/releases/tags/'),{headers:{Accept:'application/vnd.github+json'}});
assert.equal(publicRelease.ok,true,'Release must be visible without credentials');
const data=await publicRelease.json();assert.equal(data.draft,false);assert.equal(data.tag_name,'v'+release.version+'-preview');
for(const p of release.packages){
 assert.equal(p.qualified,true);assert.match(p.sha256,/^[0-9a-f]{64}$/);
 const asset=data.assets.find(a=>a.name===p.file);assert.ok(asset,'Missing release asset: '+p.file);
 assert.equal(asset.browser_download_url,p.url);assert.equal(asset.size,p.bytes);assert.equal(asset.digest,'sha256:'+p.sha256);
 const head=await fetch(p.url,{method:'HEAD',redirect:'follow'});assert.equal(head.ok,true,'Public installer URL must be downloadable');
}
const checksum=await fetch(release.checksumUrl);assert.equal(checksum.ok,true);const text=await checksum.text();
for(const p of release.packages)assert.ok(text.includes(p.sha256+'  '+p.file));
console.log(release.platform+': public release, both download links, SHA-256 and file sizes match.');
}
