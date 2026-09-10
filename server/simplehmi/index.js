'use strict';
// Product adapter only. Device state machines, protocol parsing and storage remain FUXA's.
const express=require('express'),fs=require('fs'),path=require('path');
const {EventEmitter}=require('events');
const modbus=require('../runtime/devices/modbus');
const {stepWaste}=require('./waste-simulation');
const {stepWater}=require('./water-simulation');
const {validateKnowledge,validateKnowledgeRevision,searchKnowledge}=require('./knowledge');
const {validateControl,controlSignature,createControl}=require('./control');
const {mountAgent,digest}=require('./agent');
const TYPES=new Set(['text','number','button','switch','lamp','motor','pump','valve','tank','pipe','chart','history','alarm','gauge','symbol','equipment','flow','process-status']);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clone=x=>JSON.parse(JSON.stringify(x));
const safeId=x=>typeof x==='string' && /^[a-zA-Z0-9_-]{1,90}$/.test(x) && !['__proto__','prototype','constructor'].includes(x);
function validate(p){
 if(!p||p.schemaVersion!==1||!safeId(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('工程格式或名称无效');
 p=clone(p);
 if(!Array.isArray(p.devices)||p.devices.length>20||!Array.isArray(p.pages)||!p.pages.length||p.pages.length>30)throw Error('工程需要 1–30 个画面，最多 20 台设备');
 if(p.customSymbols){if(!Array.isArray(p.customSymbols)||p.customSymbols.length>16)throw Error('自定义图形数量无效');for(const a of p.customSymbols)if(!safeId(a.id)||typeof a.name!=='string'||a.name.length>80||typeof a.svgData!=='string'||a.svgData.length>180000||!/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(a.svgData))throw Error('自定义图形格式无效')}
 if(p.system&&!['visualization','intelligent-control','industry-ai'].includes(p.system.mode))throw Error('系统模式无效');
 const ids=new Set(); const unique=id=>{if(!safeId(id)||ids.has(id))throw Error('ID 无效或重复');ids.add(id)};
 for(const d of p.devices){
  unique(d.id);if(!['sim','ModbusTCP'].includes(d.protocol))throw Error('此协议请在工程师模式配置');
  if(typeof d.name!=='string'||d.name.length>80||!Array.isArray(d.tags)||d.tags.length>200)throw Error('设备或变量无效');
  if(!/^[a-zA-Z0-9.-]{1,253}$/.test(d.host||'')||!Number.isInteger(+d.port)||+d.port<1||+d.port>65535)throw Error('IP 或端口无效');
  if(!Number.isInteger(+d.unitId)||+d.unitId<0||+d.unitId>247||!Number.isFinite(+d.polling)||+d.polling<250||+d.polling>60000||!Number.isFinite(+d.timeout)||+d.timeout<500||+d.timeout>10000)throw Error('高级通信参数超出范围');
  for(const t of d.tags){unique(t.id);if(typeof t.name!=='string'||t.name.length>80||!Number.isInteger(+t.address)||+t.address<1||+t.address>65535||!['UInt16','Int16','Float32','Bool'].includes(t.type)||!['0','100000','300000','400000'].includes(String(t.memory))||!Number.isFinite(+t.divisor)||+t.divisor<=0)throw Error('变量类型、地址或倍率无效');if(d.protocol!=='sim' && (['0','100000'].includes(String(t.memory))!==(t.type==='Bool')))throw Error('线圈与离散输入必须使用 Bool');}
 }
 const tagIds=new Set(p.devices.flatMap(d=>d.tags.map(t=>t.id)));
 for(const pg of p.pages){unique(pg.id);if(!Array.isArray(pg.components)||pg.components.length>300||![pg.width,pg.height].every(Number.isFinite)||pg.width<320||pg.width>4096||pg.height<240||pg.height>2160)throw Error('画面尺寸或组件数量无效');for(const c of pg.components){if(c.ports){for(const [side,pt] of Object.entries(c.ports))if(!['left','right','top','bottom'].includes(side)||!pt||![pt.x,pt.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('组件端口坐标无效')}if(['tank','gauge'].includes(c.kind)){c.min??=0;c.max??=100;if(!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.max<=c.min)throw Error('仪表量程无效')}unique(c.id);if(!TYPES.has(c.kind)||![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.x<0||c.y<0||c.x>pg.width||c.y>pg.height||c.w<10||c.h<10||c.w>4096||c.h>2160)throw Error('组件格式无效');if([c.tagId,c.valueTag,...(Array.isArray(c.details)?c.details.map(d=>d.tagId||d.tag):[])].some(id=>id&&!tagIds.has(id)))throw Error('组件引用了不存在的变量');}}
 for(const pg of p.pages){
  if(pg.connections!==undefined&&(!Array.isArray(pg.connections)||pg.connections.length>300))throw Error('连接数量无效');
  const components=new Set(pg.components.filter(c=>c.kind!=='flow').map(c=>c.id));
  for(const e of pg.connections||[]){unique(e.id);if(!components.has(e.from)||!components.has(e.to)||e.from===e.to)throw Error('连接端点无效');for(const key of ['fromPort','toPort'])if(e[key]&&!['left','right','top','bottom'].includes(e[key]))throw Error('连接端口无效');if(e.tagId&&!tagIds.has(e.tagId))throw Error('连接变量不存在');if(e.points&&(!Array.isArray(e.points)||e.points.length>2000||e.points.some(pt=>!pt||![pt.x,pt.y].every(Number.isFinite))))throw Error('连接路径格式无效');}
 }
 validateKnowledge(p,unique);
 validateControl(p,unique);
 return clone(p);
}
function fuxaDevice(p,d){
 const id=`sh_${p.id}_${d.id}`;
 return {id,name:d.name,type:d.protocol==='sim'?'FuxaServer':'ModbusTCP',enabled:true,polling:+d.polling,
 property:{address:`${d.host}:${d.port}`,slaveid:String(d.unitId),timeout:+d.timeout,connectionOption:'TcpPort'},
 tags:Object.fromEntries(d.tags.map(t=>{const tid=`sh_${p.id}_${t.id}`;return [tid,{id:tid,name:t.name,type:d.protocol==='sim'?(t.type==='Bool'?'boolean':'number'):t.type,address:String(t.address),memaddress:String(t.memory),divisor:+t.divisor,format:2,init:String(t.initial||0),daq:{enabled:false,changed:false,restored:false,interval:60}}]}))};
}
module.exports=function mount(app,runtime,settings,base=''){
 const dir=path.join(settings.workDir,'simplehmi');fs.mkdirSync(dir,{recursive:true});
 const staticDir=path.resolve(__dirname,'../../simplehmi');
 let active=null,fingerprint='',ready=false,queue=Promise.resolve(),simBusy=false;
 const histories=new Map(),manual=new Map();
 let processState=null;
 function serial(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
 const readTag=(d,t)=>runtime.devices.getDevicesValues()[`sh_${active.id}_${d.id}`]?.[`sh_${active.id}_${t.id}`];
 const file=id=>path.join(dir,id+'.json');
 function persist(p){const tmp=file(p.id)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(p,null,2));fs.renameSync(tmp,file(p.id));fs.writeFileSync(path.join(dir,'active.txt'),p.id);}
 async function activate(p){
  p=validate(p);
  validateKnowledgeRevision(active,p);
  if(p.pages.some(pg=>pg.connections?.length)){const {routePage}=await import('../../simplehmi/topology.mjs');p.pages=p.pages.map(pg=>pg.connections?.length?routePage(pg).page:pg)}
  if(controlSignature(p)!==controlSignature(active))control.pause('工程控制配置变化，自动控制已暂停；请检查后重新启动');
  const next=JSON.stringify([p.id,p.devices,p.simulation]);
  if(next!==fingerprint){
   const upstream=await runtime.project.getProject('admin',-1);
   upstream.devices=upstream.devices||{};
   for(const id of Object.keys(upstream.devices))if(id.startsWith('sh_'))delete upstream.devices[id];
   for(const d of p.devices){const dev=fuxaDevice(p,d);upstream.devices[dev.id]=dev;}
   await runtime.project.setProject(upstream);await runtime.restart(true);
   fingerprint=next;histories.clear();manual.clear();processState=null;
  }
  active=p;persist(p);return p;
 }
 const router=express.Router();
 router.use((req,res,next)=>{
  const ip=req.socket.remoteAddress;if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))return res.status(403).json({error:'MVP 仅允许本机访问'});
  if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return res.status(403).json({error:'禁止跨站访问'});
  if(settings.secureEnabled)return res.status(403).json({error:'已启用 FUXA 安全模式，请使用工程师入口；极简界面尚未接入登录'});
  if(!ready)return res.status(503).json({error:'Runtime 正在启动，请稍后重试'});
  res.set('Cache-Control','no-store');next();
 });
 router.use(express.json({limit:'3mb'}));
 const route=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(res.statusCode===409?409:400).json({error:e?.message||'无法连接设备或操作失败，请检查配置'})}};
 router.get('/status',route(async(req,res)=>res.json({ready,instance:process.env.SIMPLEHMI_INSTANCE||null,engine:'FUXA 1.3.4',mode:'local',activeProject:active?.id})));
 router.get('/projects',route(async(req,res)=>res.json(fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>{const p=JSON.parse(fs.readFileSync(path.join(dir,f)));return {id:p.id,name:p.name,updatedAt:fs.statSync(path.join(dir,f)).mtime.toISOString()}}))));
 router.get('/project',route(async(req,res)=>res.set('X-Project-Revision',digest(active)).json(active)));
 router.post('/project',route(async(req,res)=>{const result=await serial(async()=>{if(req.headers['if-match']&&req.headers['if-match']!==digest(active)){res.status(409);throw Error('工程已被其他 Agent 或窗口修改，请刷新后重新编辑')}return activate(req.body)});res.set('X-Project-Revision',digest(result)).json(result)}));
 router.post('/load/:id',route(async(req,res)=>{if(!safeId(req.params.id))throw Error('工程 ID 无效');const result=await serial(()=>activate(JSON.parse(fs.readFileSync(file(req.params.id)))));res.set('X-Project-Revision',digest(result)).json(result)}));
 function snapshotValues(){
  const values={},devices={};
  for(const d of active.devices){let good=0;for(const t of d.tags){const raw=readTag(d,t);const ts=raw?.ts||raw?.timestamp||0;const value=raw?.value;const fresh=value!=null&&ts>0&&Date.now()-ts<Math.max(d.polling*3,3500);values[t.id]={value:fresh?value:null,lastValue:value,ts,quality:fresh?'good':'stale'};if(fresh)good++;}devices[d.id]={connected:good>0,source:d.protocol};}
  return {values,devices,now:Date.now()};
 }
 async function writeValue(tagId,value){
const d=active.devices.find(d=>d.tags.some(t=>t.id===tagId)),t=d?.tags.find(t=>t.id===tagId);
  if(!t||!t.writable||['100000','300000'].includes(String(t.memory)))throw Error('该变量未开启写入或位于只读区');
  if(!Number.isFinite(Number(value)))throw Error('写入值必须是有效数值');
  const val=Number(value),raw=val*t.divisor;
  if(!Number.isFinite(raw)||(t.type==='Float32'&&Math.abs(raw)>3.4028234663852886e38)||(t.type==='Bool'&&![0,1].includes(val))||(t.type==='UInt16'&&(raw<0||raw>65535||!Number.isInteger(raw)))||(t.type==='Int16'&&(raw< -32768||raw>32767||!Number.isInteger(raw))))throw Error('写入值超出变量范围或精度');
  const id=`sh_${active.id}_${t.id}`,before=Date.now();
  if(d.protocol==='sim')manual.set(t.id,val);
  const accepted=await runtime.devices.setTagValue(id,t.type==='Bool'?!!val:val);
  if(!accepted)throw Error('设备拒绝写入或连接已断开，未通过回读验证');
  const end=Date.now()+Math.max(5000,d.polling*3);
  while(Date.now()<end){await sleep(180);const out=readTag(d,t);if((out?.ts||out?.timestamp||0)>=before&&Math.abs(Number(out.value)-val)<0.001)return {ok:true,value:out.value,verified:true};}
  throw Error('未收到新鲜的写入回读值，请检查设备连接、地址和写权限');
 }
 const control=createControl({getProject:()=>active,readValues:()=>snapshotValues().values,writeValue,dir});
 router.get('/values',route(async(req,res)=>res.json({...snapshotValues(),control:control.summary()})));
 router.get('/history/:id',route(async(req,res)=>res.json(histories.get(req.params.id)||[])));
 router.post('/write',route(async(req,res)=>{control.takeover(req.body.tagId);res.json(await serial(()=>writeValue(req.body.tagId,req.body.value)))}));
 router.get('/control/status',route(async(req,res)=>res.json(control.status())));
 router.get('/control/events',route(async(req,res)=>res.json(control.events())));
 router.post('/control/arm',route(async(req,res)=>res.json(await serial(async()=>{
  if(req.body.expectedRevision!==digest(active)){res.status(409);throw Error('工程已改变，请重新检查控制规则')}
  return control.arm(req.body);
 }))));
 router.post('/control/pause',route(async(req,res)=>res.json(control.pause())));
 router.post('/test',route(async(req,res)=>{
  const d=req.body;const sample={schemaVersion:1,id:'probe',name:'连接测试',devices:[{...d,tags:[]}],pages:[{id:'p',width:1024,height:640,components:[]}]};validate(sample);
  if(d.protocol==='sim')return res.json({ok:true,message:'模拟设备已就绪，数据由 FUXA Runtime 提供'});
  const events=new EventEmitter();let read=null;
  events.on('device-value:changed',e=>{const v=e.values?.probe;if(v?.value!=null)read=v.value;});
  const dev=fuxaDevice({id:'probe'},{...d,tags:[]});dev.tags={probe:{id:'probe',name:'测试读取',type:'UInt16',memaddress:'400000',address:'1',divisor:1}};
  const client=modbus.create(dev,runtime.logger,events,runtime.plugins.manager,runtime);
  if(!client)throw Error('Modbus 驱动依赖未安装');client.init(modbus.ModbusTypes.TCP);client.load(dev);
  let timer;try{await Promise.race([client.connect().catch(()=>{throw Error('无法连接设备，请检查 IP、端口及网络')}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('连接超时')),d.timeout||2000)})]);await client.polling();res.json({ok:true,read,message:read===null?'TCP 已连接，寄存器 1 读取失败；请添加有效点位':'连接成功 · 寄存器 1 当前值：'+read});}finally{clearTimeout(timer);await Promise.race([client.disconnect(),sleep(500)]);}
 }));
 router.get('/knowledge',route(async(req,res)=>res.json({entries:searchKnowledge(active,req.query.q||''),revision:digest(active)})));
 mountAgent(router,{getProject:()=>active,getValues:()=>snapshotValues().values,activate,serial,validate,dir});
 router.use((err,req,res,next)=>res.status(400).json({error:err.message}));
 app.use(base+'/simplehmi/api',router);
 app.use(base+'/simplehmi',express.static(staticDir));
 app.get(base+'/',(req,res)=>res.redirect(base+'/simplehmi/'));
 const init=setInterval(async()=>{
  if(!Object.hasOwn(runtime.devices.getDevicesStatus(),'0')||ready)return;
  clearInterval(init);
  try{let p=JSON.parse(fs.readFileSync(path.join(staticDir,'demo.json')));const marker=path.join(dir,'active.txt');if(fs.existsSync(marker)){const id=fs.readFileSync(marker,'utf8');if(safeId(id)&&fs.existsSync(file(id)))p=JSON.parse(fs.readFileSync(file(id)));}await serial(()=>activate(p));ready=true;runtime.logger.info('SimpleHMI ready at /simplehmi/');}catch(e){runtime.logger.error('SimpleHMI init failed: '+e.stack);}
 },400);
 const ticker=setInterval(async()=>{
  if(!ready||!active||simBusy)return;simBusy=true;
  try{let processValues={};
  if(active.simulation==='water-transfer'){const command=manual.has('pump_command')?manual.get('pump_command'):active.devices.flatMap(d=>d.tags).find(t=>t.id==='pump_command')?.initial;const result=stepWater(processState,command,1);processState=result.state;processValues=result.values;}
  if(active.simulation==='waste-to-energy'){const cmd=id=>manual.has(id)?manual.get(id):active.devices.flatMap(d=>d.tags).find(t=>t.id===id)?.initial;const result=stepWaste(processState,{run:cmd('plant_run'),fault:cmd('temperature_fault')});processState=result.state;processValues=result.values;}
  for(const d of active.devices)for(const [i,t] of d.tags.entries()){
   const id=`sh_${active.id}_${t.id}`;
   if(d.protocol==='sim'){const initial=Number(t.initial)||0;const value=Object.hasOwn(processValues,t.id)?processValues[t.id]:manual.has(t.id)?manual.get(t.id):(t.sim==='manual'?initial:Math.round((initial+Math.sin(Date.now()/6000+i)*Math.max(1,Math.abs(initial)*.08))*100)/100);await runtime.devices.setTagValue(id,t.type==='Bool'?!!value:value);}
   const raw=readTag(d,t),ts=raw?.ts||raw?.timestamp||0;
   if(raw?.value!=null&&Date.now()-ts<Math.max(3500,d.polling*3)){const h=histories.get(t.id)||[];h.push({time:Date.now(),value:Number(raw.value)});if(h.length>1800)h.shift();histories.set(t.id,h);}
  }}catch(e){runtime.logger.warn('SimpleHMI tick: '+e.message)}finally{simBusy=false;}
 },1000);
 ticker.unref();
 let controlBusy=false;
 const controlTicker=setInterval(async()=>{if(!ready||controlBusy)return;controlBusy=true;try{await serial(()=>control.tick())}catch(e){control.pause('控制执行器异常，已退出自动控制');runtime.logger.warn('SimpleHMI control: '+e.message)}finally{controlBusy=false}},500);
 controlTicker.unref();
};
module.exports.validate=validate;module.exports.fuxaDevice=fuxaDevice;
