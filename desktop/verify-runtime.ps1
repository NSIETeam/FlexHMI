$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '..'
if (!(Test-Path (Join-Path $runtime 'node/node.exe'))) { $runtime = Join-Path $PSScriptRoot '../runtime' }
$node = Join-Path $runtime 'node/node.exe'
$env:SIMPLEHMI_MODULES = Join-Path $runtime 'server/node_modules'
& $node -e 'const p=process.env.SIMPLEHMI_MODULES; console.log(process.version, process.arch); const sqlite=require(p+"/sqlite3"); const db=new sqlite.Database(":memory:",e=>{if(e)throw e;db.get("select 1 as ok",(e,r)=>{if(e||r.ok!==1)throw e||Error("sqlite failed");console.log("SQLite OK");db.close()})}); require(p+"/@serialport/bindings-cpp").autoDetect().list().then(x=>console.log("Serial binding OK, ports:",x.length)).catch(e=>{console.error(e);process.exitCode=1});'
if ($LASTEXITCODE -ne 0) { throw 'Native runtime check failed' }
Write-Host 'Architecture / SQLite / serial module checks passed.'
