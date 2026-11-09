param([ValidateSet('Build','Test')][string]$Action='Build',[switch]$Offline)
$ErrorActionPreference='Stop'
$nativeRoot=Split-Path $PSScriptRoot -Parent
$env:CARGO_TARGET_DIR=Join-Path $nativeRoot 'build/lua-runtime'
$temporaryRoot=Join-Path $nativeRoot 'build/lua-temp'
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
$env:TEMP=$temporaryRoot
$env:TMP=$temporaryRoot
# cc-rs /Z7 fails on this Windows checkout path; Release needs no debug info.
$env:CARGO_PROFILE_DEV_DEBUG='0'
# Match the native application's static MSVC runtime.
$env:RUSTFLAGS='-C target-feature=+crt-static'
$arguments=@('--config',(Join-Path $nativeRoot '../legacy/.cargo/config.toml'))
if($Action -eq 'Test'){$arguments+='test'}else{$arguments+='build'}
$arguments+=@('--manifest-path',(Join-Path $nativeRoot 'src/lua_runtime/Cargo.toml'),'--release','--locked')
if($Offline){$arguments+='--offline'}
& cargo @arguments
exit $LASTEXITCODE
