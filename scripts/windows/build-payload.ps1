param([Parameter(Mandatory=$true)][string]$PayloadZip,[Parameter(Mandatory=$true)][string]$Arch,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$work=Join-Path $env:RUNNER_TEMP "flex-source-$Arch"
$payload=Join-Path $work 'payload';$tools=Join-Path $work 'nsis'
New-Item -ItemType Directory -Force $payload,$tools,$OutputDirectory | Out-Null
$seven=Join-Path $env:ProgramFiles '7-Zip/7z.exe'
& $seven x -y $PayloadZip "-o$payload" | Out-Null
if($LASTEXITCODE -ne 0){throw 'Payload extraction failed'}
$manifest=Get-Content (Join-Path $payload 'build-provenance.json') -Raw | ConvertFrom-Json
$version=(Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$commit=(git -C $root rev-parse HEAD).Trim()
if($manifest.arch -ne $Arch -or $manifest.version -ne $version -or $manifest.sourceCommit -ne $commit){throw 'Payload does not match checked-out source, version or architecture'}
foreach($entry in $manifest.sourceFiles.PSObject.Properties){
 $relative=$entry.Name
 if([IO.Path]::IsPathRooted($relative) -or $relative.Split('/') -contains '..'){throw 'Invalid source path in manifest'}
 $file=Join-Path $payload $relative
 if((Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value){throw "Changed payload source: $relative"}
 # Source directory mapping used by the distribution, with license/README copied verbatim.
 $sourceRelative=if($relative.StartsWith('docs/')){'docs/simplehmi/'+$relative.Substring(5)}else{$relative}
 $sourceFile=Join-Path $root $sourceRelative
 if(!(Test-Path $sourceFile) -or (Get-FileHash $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value){throw "Payload differs from checked-out source: $relative"}
}
foreach($item in @(@('FlexHMI.exe',$manifest.nativeLauncherSHA256),@('node/node.exe',$manifest.nodeSHA256))){if((Get-FileHash (Join-Path $payload $item[0]) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item[1]){throw 'Runtime binary integrity failed'}}
if((Get-FileHash (Join-Path $root 'server/package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.serverLockSHA256){throw 'Dependency lock provenance differs'}
$archive=Join-Path $work 'nsis.7z'
Invoke-WebRequest 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z' -OutFile $archive
if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa'){throw 'NSIS checksum mismatch'}
& $seven x -y $archive "-o$tools" | Out-Null
if($LASTEXITCODE -ne 0){throw 'NSIS extraction failed'}
$uninstall=Join-Path $work 'uninstall.nsh';$lines=@()
Get-ChildItem $payload -Recurse -File | ForEach-Object { $relative=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('$','$$');$lines+='Delete "$INSTDIR\'+$relative+'"' }
Get-ChildItem $payload -Recurse -Directory | Sort-Object {$_.FullName.Length} -Descending | ForEach-Object { $relative=[IO.Path]::GetRelativePath($payload,$_.FullName).Replace('$','$$');$lines+='RMDir "$INSTDIR\'+$relative+'"' }
$lines | Set-Content $uninstall -Encoding UTF8
$output=Join-Path $OutputDirectory "FlexHMI-$version-Windows-$Arch-Setup.exe"
$env:NSISDIR=$tools
& (Join-Path $tools 'Bin/makensis.exe') /V2 "/DPAYLOAD=$payload" "/DPAYLOADGLOB=$payload\*" "/DOUTPUT=$output" "/DARCH=$Arch" "/DVERSION=$version" "/DICON=$root/desktop/icon.ico" "/DLICENSEFILE=$root/LICENSE" "/DUNINSTALLFILES=$uninstall" "$root/desktop/ipc/installer.nsi"
if($LASTEXITCODE -ne 0){throw 'Windows installer build failed'}
@{arch=$Arch;version=$version;sourceCommit=$commit;wrapper='matched Windows NSIS 3.0.4.1';payloadSHA256=(Get-FileHash $PayloadZip -Algorithm SHA256).Hash.ToLowerInvariant();file=[IO.Path]::GetFileName($output);sha256=(Get-FileHash $output -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item $output).Length;mcpIncluded=$true;sourceProvenanceVerified=$true} | ConvertTo-Json | Set-Content "$output.json" -Encoding UTF8
"FLEX_INSTALLER=$output" >> $env:GITHUB_ENV
