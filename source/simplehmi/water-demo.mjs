import {waterKnowledge} from './industry-example.mjs';
// A single shared fixture for the studio, documentation and process acceptance.
export function waterDemo(mode='visualization',id='water_'+crypto.randomUUID().replaceAll('-','').slice(0,12)){
 const makeTag=(id,name,address,initial,unit='',bool=false,writable=false)=>({id,name,address,initial,unit,type:bool?'Bool':'Float32',memory:bool?'0':'400000',divisor:1,sim:'manual',writable});
 const component=(id,kind,label,x,y,w,h,tagId)=>({id,kind,label,x,y,w,h,...(tagId?{tagId}:{}),color:'#343c43'});
 const project={schemaVersion:1,id,name:'双水箱供水 · 守恒模拟',simulation:'water-transfer',system:{mode},devices:[{id:'supply',name:'双水箱过程模拟',protocol:'sim',host:'127.0.0.1',port:502,unitId:1,polling:1000,timeout:2000,tags:[
 makeTag('source_level','原水箱液位',1,65,'%'),makeTag('destination_level','高位水箱液位',3,30,'%'),
 makeTag('pump_command','供水泵启停命令',5,1,'',true,true),makeTag('pump_running','供水泵实际运行',6,1,'',true),
 makeTag('transfer_flow','输送流量',7,36,'m³/h'),makeTag('source_volume','原水箱水量',9,3.25,'m³'),makeTag('destination_volume','高位水箱水量',11,.9,'m³'),makeTag('total_volume','系统总水量',13,4.15,'m³'),makeTag('source_low','原水箱低水位停泵',15,0,'',true),makeTag('destination_high','高位水箱高水位停泵',16,0,'',true)
 ]}],activePageId:'overview',pages:[{id:'overview',name:'工艺总览',width:1280,height:720,background:'#ffffff',components:[
 component('heading','text','双水箱供水',56,28,450,45),
 {...component('principle','text','封闭输送：无外部进水 / 用水。泵运行时，原水箱减少，高位水箱增加。',56,79,1160,40),fontSize:17},
 {...component('tank_1','tank','原水箱 · 容量 5 m³',100,155,210,240,'source_level'),min:0,max:100},
 component('pump_1','pump','供水泵',493,170.089,185,190,'pump_running'),
 {...component('tank_2','tank','高位水箱 · 容量 3 m³',860,155,210,240,'destination_level'),min:0,max:100},
 {...component('pump_switch','switch','供水泵启停',485,407,215,60,'pump_command'),action:'toggle'},
 component('source_amount','number','原水箱水量',85,505,260,110,'source_volume'),
 component('flow_value','number','当前输送流量',385,505,230,110,'transfer_flow'),
 component('total_amount','number','系统总水量（恒定）',655,505,250,110,'total_volume'),
 component('dest_amount','number','高位水箱水量',945,505,250,110,'destination_volume'),
 {...component('limits','text','模拟停泵条件：原水箱 ≤ 5% 或高位水箱 ≥ 95%。这是演示模型，不代表已配置 PLC 联锁。',60,653,1160,30),fontSize:15}
 ],connections:[{id:'supply_in',from:'tank_1',to:'pump_1',tagId:'pump_running'},{id:'supply_out',from:'pump_1',to:'tank_2',tagId:'pump_running'}]},
 {id:'trends',name:'液位与输送趋势',width:1280,height:720,background:'#ffffff',components:[component('source_chart','chart','原水箱液位 · 输送时下降',48,64,560,300,'source_level'),component('destination_chart','chart','高位水箱液位 · 输送时上升',660,64,560,300,'destination_level'),component('flow_chart','chart','输送流量 · 停泵为零',48,404,560,260,'transfer_flow'),component('balance_chart','chart','总水量 · 保持不变',660,404,560,260,'total_volume')],connections:[]}]};
 if(mode!=='visualization'){
  project.devices[0].tags.find(t=>t.id==='pump_command').initial=0;
  project.control={rules:[{id:'water_level_control',name:'高位水箱自动补水',enabled:true,inputTag:'destination_level',outputTag:'pump_command',direction:'low',onThreshold:35,offThreshold:40,onValue:1,offValue:0,outputMin:0,outputMax:1,holdMs:1000,minIntervalMs:2000,maxAgeMs:3500,guards:[{tagId:'source_level',op:'gt',value:5}]}]};
 }
 if(mode==='industry-ai'){project.knowledge=waterKnowledge();project.control.rules[0].evidence=[{entryId:'water_control_note',version:1}];}
 return project;
}
