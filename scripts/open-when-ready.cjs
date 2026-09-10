const {spawn}=require('node:child_process');
const url='http://127.0.0.1:'+(process.env.PORT||1881)+'/simplehmi/';
(async()=>{for(let attempt=0;attempt<120;attempt++){try{const response=await fetch(url+'api/status');if(response.ok){spawn('open',[url],{stdio:'ignore',detached:true}).unref();return}}catch{}await new Promise(r=>setTimeout(r,500))}console.error('服务尚未就绪，请查看启动日志。')})();
