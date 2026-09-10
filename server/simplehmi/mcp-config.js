'use strict';
const fs=require('node:fs'),path=require('node:path');
function mcpConfiguration({port,base='',workDir}={}){
 const folder=path.resolve(__dirname,'../../integrations/mcp'),script=path.join(folder,'server.mjs');
 const installed=fs.existsSync(script)&&['@modelcontextprotocol/sdk','ajv'].every(name=>fs.existsSync(path.join(folder,'node_modules',name,'package.json')));
 const ipc=workDir&&fs.existsSync(path.join(path.dirname(workDir),'controller.json'));
 const env={FLEXHMI_ACCESS:'full',FLEXHMI_PHYSICAL_WRITES:'0',FLEXHMI_AGENT_ID:'external-agent'};
 if(!ipc&&Number.isInteger(port))env.FLEXHMI_URL=`http://127.0.0.1:${port}${base}/simplehmi/api/`;
 return {installed,transport:'stdio',version:'0.3.1',configuration:{mcpServers:{flexhmi:{command:process.execPath,args:[script],env}}},message:installed?'接入扩展已安装。把配置添加到支持 MCP 的 Agent 应用，然后重新连接。':'当前安装未包含接入扩展；源码版可在项目目录运行 npm run setup:mcp 安装。',physicalWrites:false,scopeNote:'默认允许完整工程与模拟控制；真实设备写入需要用户单独配置。此范围仅约束该 MCP 进程，本机 HTTP 不是多用户认证边界。'};
}
module.exports={mcpConfiguration};
