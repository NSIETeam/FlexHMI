'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(id);
function createAssessmentStore(dir){
 const folder=path.join(dir,'assessments');fs.mkdirSync(folder,{recursive:true,mode:0o700});
 function read(id){
  if(!validId(id)||!id.startsWith('evaluation_'))throw Error('评估记录编号无效');
  const file=path.join(folder,id+'.json');
  if(!fs.existsSync(file)){const e=Error('找不到评估记录');e.status=404;throw e}
  let r;try{r=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('评估记录无法读取，请检查备份：'+id)}
  if(r.id!==id||!r.assessment||typeof r.assessment.conclusion!=='string'||!Array.isArray(r.assessment.citations)||!Array.isArray(r.assessment.conditions)||!r.assessment.observed||typeof r.summary!=='string'||!Number.isFinite(r.createdAt))throw Error('评估记录格式损坏：'+id);
  return r;
 }
 function save({project,expectedRevision,source,summary,assessment,plan,contextId}){
  const record={id:'evaluation_'+crypto.randomUUID().replaceAll('-',''),createdAt:Date.now(),projectId:project.id,projectName:project.name,expectedRevision,source,summary,assessment,status:plan?'preview':'report',...(plan?{plan}:{}),...(contextId?{contextId}:{})};
  const file=path.join(folder,record.id+'.json');
  fs.writeFileSync(file+'.tmp',JSON.stringify(record),{mode:0o600});fs.renameSync(file+'.tmp',file);return record;
 }
 function list(query={}){
  const limit=query.limit===undefined?20:Number(query.limit);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('评估记录每页数量必须为 1–100');
  if(query.projectId&&!validId(query.projectId))throw Error('工程编号无效');
  if(query.source&&!['model','external'].includes(query.source))throw Error('评估来源无效');
  if(query.cursor&&(!validId(query.cursor)||!query.cursor.startsWith('evaluation_')))throw Error('评估记录游标无效');
  if(query.q!==undefined&&(typeof query.q!=='string'||query.q.length>500))throw Error('搜索内容最多 500 字');
  const q=(query.q||'').trim().toLowerCase(),unreadable=[];
  const rows=[];
  for(const name of fs.readdirSync(folder).filter(n=>/^evaluation_[a-zA-Z0-9_-]+\.json$/.test(n))){
   let r;try{r=read(name.slice(0,-5))}catch(e){unreadable.push({id:name.slice(0,-5),error:e.message});continue}
   const projectId=r.projectId||r.plan?.project?.id||null,source=r.source||'external';
   if(query.projectId&&query.projectId!==projectId||query.source&&query.source!==source)continue;
   if(q&&!JSON.stringify([r.summary,r.assessment.conclusion,r.projectName,r.assessment.citations?.map(c=>[c.title,c.source])]).toLowerCase().includes(q))continue;
   rows.push({id:r.id,createdAt:r.createdAt,projectId,projectName:r.projectName||r.plan?.project?.name||'旧记录（工程未记录）',source,summary:r.summary,hasPlan:!!r.plan,planId:r.plan?.id||null,expiresAt:r.assessment.expiresAt,expired:r.assessment.expiresAt<=Date.now()});
  }
  rows.sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
  const anchor=query.cursor?rows.findIndex(r=>r.id===query.cursor):-1;
  if(query.cursor&&anchor<0)throw Error('游标不在当前筛选结果中，请重新加载评估记录');
  const records=rows.slice(anchor+1,anchor+1+limit);
  return {records,nextCursor:anchor+1+limit<rows.length?records.at(-1).id:null,unreadable};
 }
 return {read,save,list};
}
module.exports={createAssessmentStore};
