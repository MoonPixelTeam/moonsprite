param(
    [ValidateSet('geometry','text-0','text-1','text-2','text-3','text-4','text-5','text-6','text-7','text-8','text-9','text-10','text-11')]
    [string[]]$Phase = @('geometry') + @(0..11 | ForEach-Object { "text-$_" }),
    [string]$OutputDirectory,
    [ValidateRange(1,512)]
    [int]$RememberedFontSize = 18
)

$ErrorActionPreference = 'Stop'
$nativeRoot = Split-Path -Parent $PSScriptRoot
$appPath = Join-Path $nativeRoot 'build/Release/moonsprite-native.exe'
if (-not (Test-Path -LiteralPath $appPath)) { throw 'Build the formal Release application before running this check.' }
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $nativeRoot ('build/test-tmp/tile-repeat-phases-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + "-$PID")
}
$diagnosticRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $diagnosticRoot) { throw 'Output directory already exists; preserve previous results.' }
New-Item -ItemType Directory -Path $diagnosticRoot | Out-Null
$preferenceRoot = Join-Path $diagnosticRoot 'local-app-data'
$nativePreferences = Join-Path $preferenceRoot 'MoonSprite/Native'
New-Item -ItemType Directory -Path $nativePreferences | Out-Null
[IO.File]::WriteAllText((Join-Path $nativePreferences 'text-font-usage.txt'), "MoonSprite text-font-usage 1`n$RememberedFontSize`n", [Text.UTF8Encoding]::new($false))
$app = Get-Item -LiteralPath $appPath
$appHash = (Get-FileHash -LiteralPath $appPath -Algorithm SHA256).Hash
[PSCustomObject]@{ Path=$appPath; LastWriteTimeUtc=$app.LastWriteTimeUtc; Sha256=$appHash; Phases=$Phase; TimeoutMilliseconds=90000; LocalAppData=$preferenceRoot; RememberedFontSize=$RememberedFontSize } |
    ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $diagnosticRoot 'app.json')
$results = [System.Collections.Generic.List[object]]::new()
$oldPhase = $env:MOONSPRITE_TILE_REPEAT_CHECK_PHASE
$oldTrace = $env:MOONSPRITE_TILE_REPEAT_TRACE
$oldLocalAppData = $env:LOCALAPPDATA
$oldExpectedFontSize = $env:MOONSPRITE_TILE_REPEAT_EXPECTED_FONT_SIZE
try {
    $env:LOCALAPPDATA = $preferenceRoot
    $env:MOONSPRITE_TILE_REPEAT_EXPECTED_FONT_SIZE = [string]$RememberedFontSize
    foreach ($checkPhase in $Phase) {
        if ((Get-FileHash -LiteralPath $appPath -Algorithm SHA256).Hash -ne $appHash) { throw 'Application changed during check.' }
        $env:MOONSPRITE_TILE_REPEAT_CHECK_PHASE = $checkPhase
        $env:MOONSPRITE_TILE_REPEAT_TRACE = Join-Path $diagnosticRoot "$checkPhase.stages.tsv"
        $started = [DateTime]::UtcNow
        # PowerShell 5.1 needs the process handle retained before WaitForExit;
        # refreshing the Process object can discard a fast child's exit code.
        $process = Start-Process -FilePath $appPath -ArgumentList '--tile-repeat-check' -WorkingDirectory $nativeRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $diagnosticRoot "$checkPhase.stdout.log") -RedirectStandardError (Join-Path $diagnosticRoot "$checkPhase.stderr.log")
        $testProcessHandle = $process.Handle
        $timedOut = -not $process.WaitForExit(90000)
        if ($timedOut) {
            if (Test-Path -LiteralPath $env:MOONSPRITE_TILE_REPEAT_TRACE) {
                Copy-Item -LiteralPath $env:MOONSPRITE_TILE_REPEAT_TRACE -Destination (Join-Path $diagnosticRoot "$checkPhase.before-close.tsv")
            }
            [void]$process.CloseMainWindow()
            if (-not $process.WaitForExit(2000)) { $process.Kill(); $process.WaitForExit() }
        }
        $testExitCode = $process.ExitCode
        if ($null -eq $testExitCode) { throw "Missing exit status for $checkPhase" }
        $errors = @(foreach ($errorFile in @((Join-Path $nativeRoot 'native-tile-repeat-error.txt'), (Join-Path $nativeRoot 'build/tile-repeat-error.txt'))) {
            if (Test-Path -LiteralPath $errorFile) {
                $item = Get-Item -LiteralPath $errorFile
                if ($item.LastWriteTimeUtc -ge $started) {
                    Copy-Item -LiteralPath $errorFile -Destination (Join-Path $diagnosticRoot "$checkPhase-$($item.Name)")
                    [PSCustomObject]@{ Path=$errorFile; LastWriteTimeUtc=$item.LastWriteTimeUtc; Text=[string](Get-Content -LiteralPath $errorFile -Raw) }
                }
            }
        })
        $row = [PSCustomObject]@{ Phase=$checkPhase; ExitCode=$testExitCode; TimedOut=$timedOut; Seconds=([DateTime]::UtcNow-$started).TotalSeconds; Errors=$errors }
        $results.Add($row)
        $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $diagnosticRoot 'results.json')
        $row | ConvertTo-Json -Compress -Depth 5
        if ($timedOut -or $testExitCode -ne 0 -or $errors.Count) { exit 1 }
    }
} finally {
    $env:MOONSPRITE_TILE_REPEAT_CHECK_PHASE = $oldPhase
    $env:MOONSPRITE_TILE_REPEAT_TRACE = $oldTrace
    $env:LOCALAPPDATA = $oldLocalAppData
    $env:MOONSPRITE_TILE_REPEAT_EXPECTED_FONT_SIZE = $oldExpectedFontSize
}
