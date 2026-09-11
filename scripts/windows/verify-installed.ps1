param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Arch,[Parameter(Mandatory=$true)][string]$Artifacts)
$ErrorActionPreference = 'Stop'
$install = Join-Path $env:RUNNER_TEMP "FlexHMI 中文 安装验收"
$data = Join-Path $env:LOCALAPPDATA 'FlexHMI-IPC'
$exe = Join-Path $install 'FlexHMI.exe'
$node = Join-Path $install 'node/node.exe'
New-Item -ItemType Directory -Force $Artifacts | Out-Null
function Execute-Checked([string]$File,[string]$Arguments,[int]$Timeout=90) {
 $p=Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
 if (!$p.WaitForExit($Timeout*1000)) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; throw "Timed out: $File $Arguments" }
 $p.Refresh();if ($p.ExitCode -ne 0) { throw "Failed ($($p.ExitCode)): $File $Arguments" }
}
function Save-RuntimeLogs {
 foreach ($name in @('ipc.log','ipc.log.previous','last-error.txt')) {
  $p=Join-Path $data $name;if(Test-Path $p){Copy-Item $p (Join-Path $Artifacts $name) -Force}
 }
}
function Close-OwnedEdge {
 $profile=Join-Path $data 'browser'
 Get-CimInstance Win32_Process -Filter "name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) } | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
}
try {
 # NSIS requires /D last, without quotes around its value, including spaces.
 Execute-Checked $Installer "/S /D=$install" 180
 if(!(Test-Path $exe)){throw 'Installer did not create FlexHMI.exe'}
 $programs=[Environment]::GetFolderPath('Programs')
 Get-ChildItem $programs -Recurse | Where-Object {$_.FullName -match 'FlexHMI'} | Select-Object FullName | ConvertTo-Json | Set-Content (Join-Path $Artifacts 'installed-shortcuts.json') -Encoding UTF8
 foreach($link in @('编辑工程','运行画面','全屏运行','停止服务','卸载')){if(!(Test-Path (Join-Path $programs "FlexHMI 桌面版/$link.lnk"))){throw "Missing desktop shortcut: $link"}}
 $display=(Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/FlexHMI-IPC').DisplayName
 if($display -ne "FlexHMI 桌面版 ($Arch)"){throw 'Installer desktop name mismatch'}
 & (Join-Path $install 'desktop/verify-runtime.ps1') | Tee-Object (Join-Path $Artifacts 'native-runtime.txt')
 if($LASTEXITCODE -ne 0){throw 'Native verification failed'}
 $actual=& $node -p 'process.platform+"/"+process.arch';if($actual -ne "win32/$Arch"){throw "Wrong installed runtime: $actual"}
 Execute-Checked $exe '--editor'
 & $node (Join-Path $PSScriptRoot 'installed-smoke.cjs') $install $Artifacts $Arch exercise
 if($LASTEXITCODE -ne 0){throw 'Installed engineering/simulation exercise failed'}
 $state=(& $node (Join-Path $install 'desktop/ipc/launcher.cjs') --status | ConvertFrom-Json)
 $beforePid=$state.pid
 # Opening the native launcher again must reuse the backend.
 Execute-Checked $exe '--runtime'
 $again=(& $node (Join-Path $install 'desktop/ipc/launcher.cjs') --status | ConvertFrom-Json)
 if($beforePid -ne $again.pid){throw 'Repeated launch created a second backend'}
 $edge=@("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe","$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe") | Where-Object {Test-Path $_} | Select-Object -First 1
 if(!$edge){throw 'Microsoft Edge not installed'}
 foreach($mode in @('editor','runtime')){
  $url=$state.origin+'/simplehmi/';if($mode -eq 'runtime'){$url+='?runtime=1'}
  $profile=Join-Path $env:RUNNER_TEMP "edge-qa-$mode"
  $png=Join-Path $Artifacts "$mode.png";$dom=Join-Path $Artifacts "$mode.html";$err=Join-Path $Artifacts "$mode-edge.log"
  $edgeArguments="--headless=new --disable-gpu --no-first-run --no-sandbox --user-data-dir=`"$profile`" --window-size=1440,1000 --virtual-time-budget=5000 --screenshot=`"$png`" --dump-dom `"$url`""
  $p=Start-Process $edge -ArgumentList $edgeArguments -RedirectStandardOutput $dom -RedirectStandardError $err -PassThru
  if(!$p.WaitForExit(60000)){Stop-Process -Id $p.Id -Force;throw "Edge render timed out: $mode"}
  $html=Get-Content $dom -Raw -Encoding UTF8
  if($html -notmatch 'id="canvas"'){throw "Rendered $mode is missing the HMI canvas"}
  if($html -notmatch 'FlexHMI'){throw "Rendered $mode has no FlexHMI title"}
  if(!(Test-Path $png)){throw "No screenshot: $mode"}
 }
 Close-OwnedEdge
 $still=(& $node (Join-Path $install 'desktop/ipc/launcher.cjs') --status | ConvertFrom-Json)
 if(!$still.ready){throw 'Closing Edge stopped the backend'}
 Execute-Checked $exe '--kiosk'
 Execute-Checked $exe '--stop'
 if(Test-Path (Join-Path $data 'controller.json')){throw 'Stop left an active controller descriptor'}
 Execute-Checked $exe '--editor'
 & $node (Join-Path $PSScriptRoot 'installed-smoke.cjs') $install $Artifacts $Arch restore
 if($LASTEXITCODE -ne 0){throw 'Saved project failed to restore'}
 & $node (Join-Path $PSScriptRoot '../release/installed-features.cjs') $install $Artifacts $Arch exercise
 if($LASTEXITCODE -ne 0){throw 'Installed latest features failed'}
 Execute-Checked $exe '--stop'
 Execute-Checked $exe '--editor'
 & $node (Join-Path $PSScriptRoot '../release/installed-features.cjs') $install $Artifacts $Arch restore
 if($LASTEXITCODE -ne 0){throw 'Protected restart verification failed'}
 Close-OwnedEdge
 Execute-Checked $exe '--stop'
 $project=(Get-Content (Join-Path $Artifacts 'restore.json') -Raw | ConvertFrom-Json).projectId
 $projectFile=Join-Path $data "_appdata/simplehmi/$project.json"
 if(!(Test-Path $projectFile)){throw 'Saved engineering file missing'}
 $projectHash=(Get-FileHash $projectFile -Algorithm SHA256).Hash
 $policyFile=Join-Path $data '_appdata/simplehmi/access/policy.json'
 $policyHash=(Get-FileHash $policyFile -Algorithm SHA256).Hash
 # Seed old owned shortcut names and an unrelated file to verify selective migration.
 $legacy=Join-Path $programs 'FlexHMI 工控机版';New-Item -ItemType Directory -Force $legacy | Out-Null
 Set-Content (Join-Path $legacy '编辑工程.lnk') 'legacy qualification shortcut'
 Set-Content (Join-Path $legacy '用户说明.txt') 'preserve unrelated file'
 # Upgrade using the same installer must work after an actual run.
 Execute-Checked $Installer "/S /D=$install" 180
 if(Test-Path (Join-Path $legacy '编辑工程.lnk')){throw 'Old owned shortcut not removed'}
 if(!(Test-Path (Join-Path $legacy '用户说明.txt'))){throw 'Upgrade removed unrelated menu file'}
 Execute-Checked (Join-Path $install 'Uninstall.exe') '/S' 120
 for($i=0;$i -lt 40 -and (Test-Path $exe);$i++){Start-Sleep -Milliseconds 500}
 if(Test-Path $exe){throw 'Uninstall left the native launcher installed'}
 if(!(Test-Path $projectFile) -or (Get-FileHash $projectFile -Algorithm SHA256).Hash -ne $projectHash){throw 'Uninstall removed or changed the saved project'}
 if(!(Test-Path $policyFile) -or (Get-FileHash $policyFile -Algorithm SHA256).Hash -ne $policyHash){throw 'Upgrade or uninstall changed access policy'}
 if(Test-Path (Join-Path $programs 'FlexHMI 桌面版/编辑工程.lnk')){throw 'Uninstall left desktop shortcut'}
 @{arch=$Arch;platform='Windows';desktopNaming=$true;legacyShortcutMigration=$true;accessPolicyPreserved=$true;installerExecuted=$true;nativeRuntime=$true;simulation=$true;persistence=$true;singleInstance=$true;editorRendered=$true;runtimeRendered=$true;kioskLaunchRequested=$true;stop=$true;upgrade=$true;uninstall=$true;userDataPreserved=$true;physicalHardwareTested=$false} | ConvertTo-Json | Set-Content (Join-Path $Artifacts 'result.json') -Encoding UTF8
 Write-Host "PASS Windows $Arch installed package lifecycle"
} finally {
 Save-RuntimeLogs
 Close-OwnedEdge
 if(Test-Path $exe){try{Execute-Checked $exe '--stop' 20}catch{Write-Warning $_}}
}
