# Optional local toolchain, isolated under this checkout (no machine-wide changes).
$mseRepo = Split-Path -Parent $PSScriptRoot
$mseTools = Join-Path $mseRepo 'artifacts/toolchain'
if (Test-Path -LiteralPath "$mseTools/jdk") {
    $env:JAVA_HOME = (Get-ChildItem -Directory -LiteralPath "$mseTools/jdk" | Select-Object -First 1).FullName
}
if (Test-Path -LiteralPath "$mseTools/sdk") { $env:ANDROID_HOME = "$mseTools/sdk" }
if (Test-Path -LiteralPath "$mseTools/sdk/ndk/27.2.12479018") { $env:NDK_HOME = "$mseTools/sdk/ndk/27.2.12479018" }
if (Test-Path -LiteralPath "$mseTools/rustup/toolchains/stable-x86_64-pc-windows-msvc/bin") {
    $env:RUSTUP_HOME = "$mseTools/rustup"
    $env:CARGO_HOME = "$mseTools/cargo"
    $env:PATH = "$mseTools/rustup/toolchains/stable-x86_64-pc-windows-msvc/bin;$env:PATH"
}
$env:GRADLE_USER_HOME = "$mseTools/gradle"
$env:ANDROID_USER_HOME = "$mseTools/android-user"
$env:TEMP = "$mseTools/tmp"
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP,$env:ANDROID_USER_HOME | Out-Null
$env:PATH = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:PATH"
$env:PATH = "$mseTools/node;$env:PATH"
