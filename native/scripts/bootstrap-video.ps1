$ErrorActionPreference = 'Stop'
$nativeRoot = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $nativeRoot '.cache'
$toolsRoot = Join-Path $cache 'video-tools'
$source = Join-Path $cache 'libvpx-1.15.2'
$build = Join-Path $nativeRoot 'build/libvpx'
$commit = 'd168454ecd099805c675d4a98c66f4891373302a'
New-Item -ItemType Directory -Force $toolsRoot,$build | Out-Null
if (!(Test-Path -LiteralPath $source)) {
  & git clone --depth 1 --branch v1.15.2 https://github.com/webmproject/libvpx.git $source
  if ($LASTEXITCODE -ne 0) { throw 'libvpx fetch failed; no automatic retry' }
}
if ((& git -C $source rev-parse HEAD) -ne $commit) { throw 'Existing libvpx differs from pinned commit; left untouched' }
function Download-Checked($url,$file,$hash) {
  if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest -Uri $url -OutFile $file }
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $hash) { throw "Hash mismatch: $file" }
}
$nasmZip = Join-Path $toolsRoot 'nasm-2.16.03-win64.zip'
Download-Checked 'https://www.nasm.us/pub/nasm/releasebuilds/2.16.03/win64/nasm-2.16.03-win64.zip' $nasmZip '3EE4782247BCB874378D02F7EAB4E294A84D3D15F3F6EE2DE2F47A46AA7226E6'
$nasmRoot = Join-Path $toolsRoot 'nasm-2.16.03'
if (!(Test-Path -LiteralPath $nasmRoot)) { Expand-Archive -LiteralPath $nasmZip -DestinationPath $toolsRoot }
$makeArchive = Join-Path $toolsRoot 'make-4.4.1.tar.gz'
Download-Checked 'https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz' $makeArchive 'DD16FB1D67BFAB79A72F5E8390735C49E3E8E70B4945A15AB1F81DDB78658FB3'
$makeRoot = Join-Path $toolsRoot 'make-4.4.1'
if (!(Test-Path -LiteralPath $makeRoot)) {
  & tar -xf $makeArchive -C $toolsRoot
  if ($LASTEXITCODE -ne 0) { throw 'Cannot extract GNU Make' }
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Visual Studio 2022 C++ tools are required' }
$makeExe = Join-Path $makeRoot 'WinRel/gnumake.exe'
if (!(Test-Path -LiteralPath $makeExe)) {
  $driver = Join-Path $makeRoot 'moonsprite-build.cmd'
  @('@echo off',('call "' + (Join-Path $vs 'Common7/Tools/VsDevCmd.bat') + '" -arch=x64 -host_arch=x64'),('cd /d "' + $makeRoot + '"'),'call build_w32.bat --without-guile','exit /b %errorlevel%') | Set-Content -LiteralPath $driver -Encoding utf8
  & $env:ComSpec /d /c ('"' + $driver + '"')
  if ($LASTEXITCODE -ne 0) { throw 'Cannot build pinned GNU Make' }
}
# Only this freshly built cache tool may need its inherited Low label corrected.
# Restore its original DACL, as for the existing desktop-output integrity helper.
$label = & "$env:WINDIR/System32/icacls.exe" $makeExe
if ($label -match 'S-1-16-4096|Low Mandatory|低强制') {
  $section = [Security.AccessControl.AccessControlSections]::Access
  $acl = Get-Acl -LiteralPath $makeExe
  $original = $acl.GetSecurityDescriptorSddlForm($section)
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
  try {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user,[Security.AccessControl.FileSystemRights]::TakeOwnership,[Security.AccessControl.AccessControlType]::Allow))
    Set-Acl -LiteralPath $makeExe -AclObject $acl
    & "$env:WINDIR/System32/icacls.exe" $makeExe /setintegritylevel M
    if ($LASTEXITCODE -ne 0) { throw 'Cannot correct cached Make integrity label' }
  } finally {
    $restore = Get-Acl -LiteralPath $makeExe
    $restore.SetSecurityDescriptorSddlForm($original,$section)
    Set-Acl -LiteralPath $makeExe -AclObject $restore
  }
}
$gitRoot = Split-Path (Split-Path (Get-Command git).Source -Parent) -Parent
$bash = Join-Path $gitRoot 'bin/bash.exe'
if (!(Test-Path -LiteralPath $bash)) { throw 'Git for Windows Bash is required' }
$oldPath = $env:PATH
try {
  $env:PATH = "$nasmRoot;$oldPath"
  Push-Location $build
  try {
    & $bash -c '../../.cache/libvpx-1.15.2/configure --target=x86_64-win64-vs17 --as=nasm --enable-vp8 --enable-vp9 --disable-examples --disable-tools --disable-docs --disable-unit-tests --enable-static --disable-shared --enable-static-msvcrt'
    if ($LASTEXITCODE -ne 0) { throw 'libvpx configure failed' }
  } finally { Pop-Location }
  & python (Join-Path $PSScriptRoot 'prepare-vpx-build.py') $bash '../../.cache/video-tools/make-4.4.1/WinRel/gnumake.exe'
  if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare libvpx project' }
  & (Join-Path $vs 'MSBuild/Current/Bin/MSBuild.exe') (Join-Path $build 'vpx.vcxproj') /p:Configuration=Release /p:Platform=x64 /m:4 /v:minimal
  if ($LASTEXITCODE -ne 0) { throw 'libvpx build failed' }
} finally { $env:PATH = $oldPath }
Write-Host 'Pinned libvpx VP9/VP8 encoder ready in native/build/libvpx.'
