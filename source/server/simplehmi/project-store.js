'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const valid=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
function fail(message,status=409){throw Object.assign(Error(message),{status,code:'saved-project-conflict'})}
function projectStore(dir,validate){
 const trash=path.join(dir,'trash');fs.mkdirSync(trash,{recursive:true});
 const file=(id,archived=false)=>{if(!valid(id))fail('工程或归档 ID 无效',400);return path.join(archived?trash:dir,id+'.json')};
 function read(id,archived=false){const f=file(id,archived);if(!fs.existsSync(f))fail('保存工程或归档不存在',404);const raw=JSON.parse(fs.readFileSync(f,'utf8')),project=validate(raw);if(!archived&&project.id!==id)fail('工程文件与 ID 不匹配',400);return {project,revision:hash(raw),updatedAt:fs.statSync(f).mtime.toISOString()};}
 function inventory(activeId){const scan=archived=>fs.readdirSync(archived?trash:dir).filter(n=>n.endsWith('.json')).map(n=>{const key=n.slice(0,-5);try{const r=read(key,archived);return {id:r.project.id,name:r.project.name,revision:r.revision,updatedAt:r.updatedAt,...(archived?{archiveId:key}:{active:key===activeId})}}catch(e){return {id:key,error:e.message,unavailable:true}}});return {projects:scan(false),archives:scan(true)};}
 function matches(id,revision,archived=false){const f=file(id,archived);if(revision===null)return !fs.existsSync(f);try{return read(id,archived).revision===revision}catch{return false}}
 function check(conditions=[]){for(const c of conditions)if(!matches(c.id,c.revision,c.archived))fail('保存工程或归档已变化，请重新读取列表并预览');}
 function prepare(op,activeId){
  const archived=op.op==='project.restore',key=archived?op.archiveId:op.id,r=read(key,archived);
  if(op.expectedSavedRevision!==r.revision)fail('保存工程版本不一致，请重新读取工程');
  if(op.op==='project.load')return {project:r.project,conditions:[{id:key,revision:r.revision}]};
  if(r.project.id===activeId)fail('不能删除或覆盖当前运行工程；请先切换到其他工程',400);
  const archiveId=archived?key:'archive_'+crypto.randomUUID().replaceAll('-','');
  const source={id:key,archived,revision:r.revision},target={id:archived?r.project.id:archiveId,archived:!archived,revision:null};
  check([source,target]);return {project:r.project,conditions:[source,target],effect:{action:archived?'restore':'delete',projectId:r.project.id,archiveId,revision:r.revision,source,target}};
 }
 function execute(effect){check([effect.source,effect.target]);fs.renameSync(file(effect.source.id,effect.source.archived),file(effect.target.id,effect.target.archived));}
 function completed(effect){return matches(effect.source.id,null,effect.source.archived)&&matches(effect.target.id,effect.revision,effect.target.archived)}
 return {read,inventory,prepare,check,execute,completed,exists:id=>fs.existsSync(file(id))};
}
module.exports={projectStore};
