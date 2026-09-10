# Build an ARM64 test APK, including Windows machines without symlink privileges.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/android-env.ps1"
$mseRepo = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $mseRepo
try {
    & pnpm.cmd android:prepare
    if ($LASTEXITCODE -ne 0) { throw 'Android preparation failed' }
    New-Item -ItemType Directory -Force -Path artifacts | Out-Null
    $mseLog = Join-Path $mseRepo 'artifacts/android-build.log'
    $ErrorActionPreference = 'Continue'
    & pnpm.cmd exec tauri android build --debug --apk --target aarch64 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $mseLog
    $mseBuildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($mseBuildExit -ne 0) {
        $mseOutput = Get-Content -Raw -LiteralPath $mseLog
        if ($mseOutput -notmatch 'Failed to create a symbolic link' -or $mseOutput -notmatch 'libmoonsprite_lib.so') {
            throw 'Tauri build failed; see artifacts/android-build.log. No stale library will be packaged.'
        }
        $mseLibrary = Join-Path $mseRepo 'src-tauri/target/aarch64-linux-android/debug/libmoonsprite_lib.so'
        if (-not (Test-Path -LiteralPath $mseLibrary)) { throw 'Compiled ARM64 library is missing' }
        $mseJni = Join-Path $mseRepo 'src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a'
        New-Item -ItemType Directory -Force -Path $mseJni | Out-Null
        Copy-Item -LiteralPath $mseLibrary -Destination (Join-Path $mseJni 'libmoonsprite_lib.so') -Force
        # Retain the original symbol-rich library in target/ for debugging.
        & "$env:NDK_HOME/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-strip.exe" --strip-debug (Join-Path $mseJni 'libmoonsprite_lib.so')
        if ($LASTEXITCODE -ne 0) { throw 'Failed to strip packaged debug symbols' }
        & ./src-tauri/gen/android/gradlew.bat -p ./src-tauri/gen/android :app:clean :app:assembleArm64Debug -x :app:rustBuildArm64Debug --console=plain --no-daemon
        if ($LASTEXITCODE -ne 0) { throw 'Gradle APK packaging failed' }
    }
    $mseApk = Get-ChildItem -LiteralPath 'src-tauri/gen/android/app/build/outputs/apk' -Recurse -Filter '*arm64*debug.apk' | Select-Object -First 1
    if (-not $mseApk) { throw 'Expected ARM64 debug APK was not generated' }
    New-Item -ItemType Directory -Force -Path artifacts/apk | Out-Null
    Copy-Item -LiteralPath $mseApk.FullName -Destination artifacts/apk/MoonSprite-Android-Test-arm64.apk -Force
    Write-Output (Join-Path $mseRepo 'artifacts/apk/MoonSprite-Android-Test-arm64.apk')
} finally { Pop-Location }
