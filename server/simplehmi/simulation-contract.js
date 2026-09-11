'use strict';
const {stepWater}=require('./water-simulation');
const {stepWaste}=require('./waste-simulation');
const models={
 'water-transfer':{commands:['pump_command'],binary:new Set(['pump_running','source_low','destination_high']),types:['Bool'],sample:()=>stepWater(null,0,0).values},
 'waste-to-energy':{commands:['plant_run','temperature_fault'],binary:new Set(['air_fan','induced_fan','recirc_fan','furnace_on','boiler_on','turbine_on','lime_pump','carbon_feed','filter_on','temp_alarm']),types:['Bool','UInt16'],sample:()=>stepWaste(null,{run:false,fault:false},0).values}
};
function validateSimulation(p){
 if(p.simulation==null)return;
 const model=Object.hasOwn(models,p.simulation)?models[p.simulation]:null;
 const fail=(location,message)=>{throw Object.assign(Error(location+'：'+message),{code:'invalid-simulation'})};
 if(!model)fail('工程/simulation','未知过程模型；普通独立模拟请移除 simulation 字段');
 const tags=new Map(p.devices.flatMap(d=>d.tags.map(t=>[t.id,{d,t}])));
 for(const id of model.commands)if(!tags.has(id))fail('工程/simulation/'+p.simulation,'缺少命令点 '+id+'；请创建该点，或移除过程模型后再删除命令点');
 for(const id of new Set([...model.commands,...Object.keys(model.sample())])){
  const entry=tags.get(id);if(!entry)continue; // Outputs may be omitted from a smaller dashboard.
  const {d,t}=entry,location='设备/'+d.id+'/变量/'+id,command=model.commands.includes(id);
  if(d.protocol!=='sim')fail(location,'内置过程模型点必须属于模拟设备；接真机前请移除 simulation 字段');
  const types=command||model.binary.has(id)?model.types:['Float32'];
  if(!types.includes(t.type))fail(location,'过程模型点类型必须为 '+types.join(' 或 '));
  if(t.sim!=='manual')fail(location,'过程模型点必须使用 manual，不能叠加独立波动');
  if(Number(t.divisor)!==1)fail(location,'过程模型已输出工程量，倍率必须为 1');
  if(command){
   if(t.writable!==true||['100000','300000'].includes(String(t.memory)))fail(location,'过程命令必须允许写入且位于可写区');
   if(![0,1,false,true].includes(t.initial))fail(location,'命令初始值必须为 0 或 1');
  }else if(t.writable)fail(location,'过程反馈由模型计算，必须只读；请绑定对应命令点执行操作');
 }
}
function initialSimulationValues(p){
 const command=id=>Number(p.devices.flatMap(d=>d.tags).find(t=>t.id===id)?.initial)===1;
 if(p.simulation==='water-transfer')return stepWater(null,command('pump_command'),0).values;
 if(p.simulation==='waste-to-energy')return stepWaste(null,{run:command('plant_run'),fault:command('temperature_fault')},0).values;
 return {};
}
module.exports={validateSimulation,initialSimulationValues};
