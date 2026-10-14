param([switch]$Run, [switch]$CoreOnly)
$ErrorActionPreference = 'Stop'
$nativeRoot = Split-Path $PSScriptRoot -Parent
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Install Visual Studio 2022 Desktop development with C++ and CMake tools.' }
$cmake = Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$ctest = Join-Path (Split-Path $cmake -Parent) 'ctest.exe'
$build = Join-Path $nativeRoot $(if($CoreOnly){'build-core'}else{'build'})
$app = if($CoreOnly){'OFF'}else{'ON'}
& $cmake -S $nativeRoot -B $build -G 'Visual Studio 17 2022' -A x64 '-DCMAKE_BUILD_TYPE=Release' "-DMOONSPRITE_BUILD_APP=$app"
if ($LASTEXITCODE -ne 0) { throw 'Configure failed' }
& $cmake --build $build --config Release --parallel 8
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
& $ctest --test-dir $build -C Release --output-on-failure
if ($LASTEXITCODE -ne 0) { throw 'Core tests failed' }
if ($Run -and !$CoreOnly) { & (Join-Path $build 'Release/moonsprite-native.exe') }
