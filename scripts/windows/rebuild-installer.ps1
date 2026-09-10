param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Arch,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$work=Join-Path $env:RUNNER_TEMP "flex-nsis-$Arch"
$payload=Join-Path $work 'payload';$tools=Join-Path $work 'nsis'
New-Item -ItemType Directory -Force $payload,$tools,(Split-Path $Output) | Out-Null
$seven=Join-Path $env:ProgramFiles '7-Zip/7z.exe'
if(!(Test-Path $seven)){throw '7-Zip missing from Windows build runner'}
& $seven x -y $Installer "-o$payload" | Out-Null
if($LASTEXITCODE -ne 0){throw 'Candidate payload extraction failed'}
# Rebuild only the NSIS wrapper. Preserve the exact candidate application payload.
foreach($extra in @('$PLUGINSDIR','Uninstall.exe')){ $p=Join-Path $payload $extra;if(Test-Path $p){Remove-Item -Recurse -Force $p} }
if(!(Test-Path (Join-Path $payload 'FlexHMI.exe')) -or !(Test-Path (Join-Path $payload 'node/node.exe'))){throw 'Extracted payload is missing the launcher or Node runtime'}
$archive=Join-Path $work 'nsis.7z'
Invoke-WebRequest 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z' -OutFile $archive
if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa'){throw 'NSIS tool bundle checksum mismatch'}
& $seven x -y $archive "-o$tools" | Out-Null
if($LASTEXITCODE -ne 0){throw 'NSIS extraction failed'}
$uninstall=Join-Path $work 'uninstall.nsh'
$lines=@()
Get-ChildItem $payload -Recurse -File | ForEach-Object { $relative=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('$','$$');$lines+='Delete "$INSTDIR\'+$relative+'"' }
Get-ChildItem $payload -Recurse -Directory | Sort-Object {$_.FullName.Length} -Descending | ForEach-Object { $relative=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('$','$$');$lines+='RMDir "$INSTDIR\'+$relative+'"' }
$lines | Set-Content $uninstall -Encoding UTF8
$env:NSISDIR=$tools
& (Join-Path $tools 'Bin/makensis.exe') /V2 "/DPAYLOAD=$payload" "/DPAYLOADGLOB=$payload\*" "/DOUTPUT=$Output" "/DARCH=$Arch" "/DICON=$root/desktop/icon.ico" "/DLICENSEFILE=$root/LICENSE" "/DUNINSTALLFILES=$uninstall" "$root/desktop/ipc/installer.nsi"
if($LASTEXITCODE -ne 0){throw 'Native Windows NSIS build failed'}
$evidence=@{arch=$Arch;wrapper='matched Windows NSIS 3.0.4.1';sourceInstallerSHA256=(Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant();file=[IO.Path]::GetFileName($Output);sha256=(Get-FileHash $Output -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item $Output).Length;payload='Extracted unchanged from verified source installer; not latest repository source'}
$evidence | ConvertTo-Json | Set-Content "$Output.json" -Encoding UTF8
"FLEX_INSTALLER=$Output" >> $env:GITHUB_ENV
