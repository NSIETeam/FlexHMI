'use strict';
const {createHash}=require('node:crypto');
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
function checkPointWrite(project,values,request,now=Date.now()) {
 const fail=(message,status=400,code='invalid-write')=>{throw Object.assign(Error(message),{status,code})};
 if(request.expectedRevision!==digest(project))fail('工程已变化，请重新读取状态；未执行写入',409,'revision-conflict');
 const device=project.devices.find(d=>d.id===request.deviceId),tag=device?.tags.find(t=>t.id===request.tagId);
 if(!tag)fail('设备与变量不匹配');
 if(!tag.writable||['100000','300000'].includes(String(tag.memory)))fail('变量未允许写入或位于只读区');
 if(device.protocol==='sim'&&tag.sim!=='manual')fail('自动模拟信号不能作为 Agent 写入目标，请先改为手动模拟输出');
 if(device.protocol!=='sim'&&request.allowPhysical!==true)fail('当前 Agent 未授权真实设备写入',403,'physical-write-not-authorized');
 for(const key of ['value','expectedValue','outputMin','outputMax'])if(!(['number','boolean'].includes(typeof request[key]))||!Number.isFinite(Number(request[key])))fail('写入值、预期值及上下界必须为有限数值');
 const min=Number(request.outputMin),max=Number(request.outputMax),value=Number(request.value);
 const raw=value*tag.divisor;
 if(!Number.isFinite(raw)||(tag.type==='Float32'&&Math.abs(raw)>3.4028234663852886e38)||(tag.type==='Bool'&&![0,1].includes(value))||(tag.type==='UInt16'&&(raw<0||raw>65535||!Number.isInteger(raw)))||(tag.type==='Int16'&&(raw< -32768||raw>32767||!Number.isInteger(raw))))fail('写入值超出变量类型范围或精度');
 if(min>max||value<min||value>max)fail('写入值超出本次操作声明的上下界');
 const maxAge=request.maxAgeMs??3500;
 if(!Number.isInteger(maxAge)||maxAge<500||maxAge>60000)fail('数据时效应为 500–60000 毫秒');
 if(!Number.isFinite(request.observedAt)||request.observedAt<=0||request.observedAt>now+1000||now-request.observedAt>maxAge)fail('Agent 的观察已过期，请重新读取目标值');
 const actual=values[tag.id];
 if(!actual||actual.quality!=='good'||!Number.isFinite(actual.ts)||now-actual.ts>maxAge||actual.ts>now+1000||actual.value===null||!['number','boolean'].includes(typeof actual.value)||!Number.isFinite(Number(actual.value)))fail('目标读数无效或过期，请先恢复采集');
 if(actual.ts<request.observedAt)fail('采集时间早于声明的观察，请重新读取');
 if(Number(actual.value)!==Number(request.expectedValue))fail('目标值已改变，请重新读取；未执行写入',409,'value-conflict');
 return {device,tag,value,previous:actual.value};
}
module.exports={checkPointWrite};
