const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const child = spawn(process.execPath, ['main.js'], {cwd:path.join(root,'server'), stdio:'inherit', env:{...process.env,SIMPLEHMI:'1',PORT:process.env.PORT || '1881'}});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code || 0));
