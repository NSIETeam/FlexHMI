// Fault-injection fixture: real Agent routes/journal with an isolated persistence adapter.
const fs=require('node:fs'),path=require('node:path');
const express=require('../../server/node_modules/express');
const {mountAgent}=require('../../server/simplehmi/agent');
const {validate}=require('../../server/simplehmi');
const dir=process.env.FLEXHMI_TEST_DIR;
let active=JSON.parse(fs.readFileSync(path.join(dir,'active.json'))),queue=Promise.resolve();
const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p};
function pause(phase){if(process.env.FLEXHMI_CRASH_PHASE!==phase)return;process.send({phase});return new Promise(()=>{});}
const app=express();app.use(express.json());
const agent=mountAgent(app,{dir,validate,serial,getProject:()=>active,activate:async p=>{await pause('before-save');active=validate(p);fs.writeFileSync(path.join(dir,active.id+'.json'),JSON.stringify(active));fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(active));await pause('after-save');return active}});
app.post('/editor-save',async(req,res)=>{try{res.json(await serial(()=>agent.saveEditor(req.body.project,{expectedRevision:req.body.expectedRevision})))}catch(e){res.status(e.status||400).json({error:e.message})}});
agent.recover().then(()=>{const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));}).catch(e=>{process.send({error:e.stack});process.exitCode=1});
