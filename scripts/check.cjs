const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const file of ['desktop/ipc/launcher.cjs','scripts/agent-cli.cjs','server/simplehmi/knowledge.js','simplehmi/knowledge-panel.mjs','simplehmi/industry-example.mjs','server/simplehmi/control.js','simplehmi/control-panel.mjs','server/simplehmi/water-simulation.js','simplehmi/water-demo.mjs','server/simplehmi/ai.js','server/simplehmi/ai-contract.js','simplehmi/ai-panel.mjs','server/simplehmi/agent.js','simplehmi/topology.mjs','simplehmi/agent-studio.mjs','simplehmi/layout.mjs','simplehmi/svg-import.mjs','desktop/main.cjs','desktop/preload.cjs','desktop/backend.cjs','simplehmi/app.js','simplehmi/process.js','server/simplehmi/waste-simulation.js','server/simplehmi/index.js','scripts/start.cjs','scripts/modbus-simulator.cjs']) {
 cp.execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});
}
const demo=JSON.parse(fs.readFileSync(path.join(root,'simplehmi/demo.json')));
if(demo.pages.length<1||demo.devices.length<1)throw Error('Demo missing');
console.log('SimpleHMI source and demo checks passed');
