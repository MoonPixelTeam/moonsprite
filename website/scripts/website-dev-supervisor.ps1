#requires -Version 5.1
<#
  MoonSprite website dev-server supervisor.

  The launcher (open-website .bat) only had one job: start "vite" once and open
  the browser. Vite is a short-lived process though - a broken vite.config.ts,
  a port that is still held, a killed Node process, or an edited dependency all
  make it exit, and after that hot reload is simply dead until someone notices
  and re-runs the launcher.

  This script owns the dev server instead:

    * starts the runner (pnpm dev --strictPort ...) in this window,
    * streams the runner output to this console and to a log file,
    * restarts it automatically when it exits during editing,
    * reclaims the port when a leftover process still holds it, and
    * clears that leftover listener once the server is gone for good.

  Ctrl+C asks the supervisor to stop the server and quit.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$WorkingDirectory,

  [Parameter(Mandatory = $true)]
  [string]$CommandLine,

  [string]$Url = 'http://127.0.0.1:4174',

  # The caller already probed the URL and got no answer, so a process that still
  # holds the port is a leftover from an earlier run, not a healthy dev server.
  [switch]$TakeOverPort
)

$ErrorActionPreference = 'Stop'

$script:ServerProcess = $null
$script:StopRequested = $false
$script:AttemptStartLine = 0

$MaxRestarts = 30
$RestartDelaySeconds = 2
$StartupTimeoutSeconds = 60
$TailLinesOnRestart = 40
$MaxLogBytes = 8MB

try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
} catch {
  # A redirected console may refuse encoding changes; the script still works.
}

function Invoke-Sleep {
  param([int]$Seconds)
  Start-Sleep -Seconds $Seconds
}

function Get-ListenerProcessId {
  $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port } |
    Select-Object -First 1
  if ($null -eq $connection) { return 0 }
  return [int]$connection.OwningProcess
}

function Test-ServerListening {
  return ((Get-ListenerProcessId) -ne 0)
}

function Open-Browser {
  try {
    Start-Process -FilePath $Url | Out-Null
  } catch {
    Write-Host "[MoonSprite] Could not open the browser: $($_.Exception.Message)"
  }
}

function Quote-Argument {
  param([string]$Value)
  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }
  return $Value
}

function Start-DevServer {
  $script:AttemptStartLine = Get-LogLineCount
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $Command
  $startInfo.Arguments = ($script:Arguments | ForEach-Object { Quote-Argument $_ }) -join ' '
  $startInfo.WorkingDirectory = $Root
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  try {
    # Vite writes UTF-8; without this the console mangles Chinese diagnostics.
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $startInfo.StandardOutputEncoding = $utf8
    $startInfo.StandardErrorEncoding = $utf8
  } catch {
    # Older hosts ignore the hint; output still flows.
  }
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  $null = $process.Start()
  $script:ServerProcess = $process
  return $process
}

function Stop-DevServer {
  $process = $script:ServerProcess
  if ($null -eq $process) { return }
  try {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # The server may already be gone; nothing to clean up.
  }
  $script:ServerProcess = $null
}

function Stop-ListenerOnPort {
  $portProcessId = Get-ListenerProcessId
  if ($portProcessId -eq 0) { return }
  Write-Host "[MoonSprite] Port $Port is still held by process $portProcessId; stopping it."
  Stop-Process -Id $portProcessId -Force -ErrorAction SilentlyContinue
}

$Root = (Resolve-Path -LiteralPath $WorkingDirectory).Path
if (Test-Path -LiteralPath (Join-Path $Root 'website\package.json')) {
  $Root = Join-Path $Root 'website'
}
if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json'))) {
  Write-Host "[MoonSprite] No package.json in: $Root"
  Write-Host "[MoonSprite] The path looks unreadable, so the launcher handed over mangled characters."
  Write-Host "[MoonSprite] Keep this project path ASCII-only, or start Vite from a terminal instead."
  exit 1
}

$Port = 4174
$urlMatch = [regex]::Match($Url, ':(\d{2,5})(?:/|$)')
if ($urlMatch.Success) { $Port = [int]$urlMatch.Groups[1].Value }

$LogPath = Join-Path ([System.IO.Path]::GetTempPath()) 'moonsprite-website-dev.log'
if ((Test-Path -LiteralPath $LogPath) -and ((Get-Item -LiteralPath $LogPath).Length -gt $MaxLogBytes)) {
  Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
}
$stream = [System.IO.File]::Open($LogPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
$script:LogWriter = New-Object System.IO.StreamWriter -ArgumentList $stream, (New-Object System.Text.UTF8Encoding $false)
$script:LogWriter.AutoFlush = $true

function Write-ServerLine {
  param([string]$Line)
  if ($null -ne $script:LogWriter) {
    try { $script:LogWriter.WriteLine($Line) } catch {}
  }
  Write-Host $Line
}

function Get-LogLineCount {
  if (-not (Test-Path -LiteralPath $LogPath)) { return 0 }
  try { return @(Get-Content -LiteralPath $LogPath -ErrorAction SilentlyContinue).Count } catch { return 0 }
}

if (Test-ServerListening) {
  if (-not $TakeOverPort) {
    Write-Host "[MoonSprite] The website is already running on $Url"
    Open-Browser
    $script:LogWriter.Dispose()
    exit 0
  }

  # Never kill a healthy server: only a port holder that refuses to answer.
  $healthy = $false
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $Url
    $healthy = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    $healthy = $false
  }

  if ($healthy) {
    Write-Host "[MoonSprite] The website is already running on $Url"
    Open-Browser
    $script:LogWriter.Dispose()
    exit 0
  }

  Stop-ListenerOnPort
  Start-Sleep -Milliseconds 500
}

Write-Host "[MoonSprite] Website root: $Root"
Write-Host "[MoonSprite] Server log:   $LogPath"
Write-Host ""

try {
  $parts = $CommandLine.Trim() -split '\s+'
  $runner = $parts[0]
  if (-not (Test-Path -LiteralPath $runner)) {
    $resolved = Get-Command $runner -ErrorAction SilentlyContinue
    if ($null -eq $resolved) {
      Write-Host "[MoonSprite] Package runner not found: $runner"
      $script:LogWriter.Dispose()
      exit 1
    }
    $runner = $resolved.Source
  }
  $Command = $runner
  $script:Arguments = @()
  if ($parts.Count -gt 1) { $script:Arguments = $parts[1..($parts.Count - 1)] }

  # "cmd /c pnpm.cmd dev" must resolve pnpm through PATH; running the shim by
  # absolute path through cmd.exe survives working directories and PATH edits.
  if ($parts.Count -gt 2 -and $parts[1] -eq '/c' -and $parts[2] -match '\.(cmd|bat)$') {
    $shim = Get-Command $parts[2] -ErrorAction SilentlyContinue
    if ($null -ne $shim) {
      Write-Host "[MoonSprite] Using $($shim.Source) instead of bare $($parts[2])."
      $Command = $shim.Source
      $script:Arguments = $parts[3..($parts.Count - 1)]
    }
  }

  # Ctrl+C is a normal way to stop the supervisor, not a crash.
  $null = Register-EngineEvent -SourceIdentifier ([System.Management.Automation.PsEngineEvent]::Exiting) -Action {
    try {
      if ($null -ne $script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        Stop-Process -Id $script:ServerProcess.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
      # Best effort cleanup while the engine is shutting down.
    }
  }

  Write-Host "[MoonSprite] Command: $Command $($script:Arguments -join ' ')"
  Write-Host "[MoonSprite] Close this window to stop the website."
  Write-Host ""

  $attempt = 0
  $exitCode = 0
  $keepRunning = $true

  while ($keepRunning) {
    $attempt = $attempt + 1
    if ($attempt -gt 1) {
      Write-Host ""
      Write-Host "[MoonSprite] Restarting the website (attempt $attempt)..."
    }

    $server = Start-DevServer

    $ready = $false
    $ticks = 0
    while (-not $ready -and $ticks -lt ($StartupTimeoutSeconds * 2)) {
      Start-Sleep -Milliseconds 500
      $ticks = $ticks + 1
      if (Test-ServerListening) { $ready = $true; break }
      if ($server.HasExited) { break }
    }

    if ($ready) {
      Write-Host ""
      if ($attempt -eq 1) {
        Write-Host "[MoonSprite] Website ready: $Url"
        Open-Browser
      } else {
        Write-Host "[MoonSprite] Website ready again: $Url"
      }
    } else {
      Write-Host "[MoonSprite] The dev server has not answered yet; showing its output."
      Start-Sleep -Seconds 2
    }

    $stdoutTask = $server.StandardOutput.ReadLineAsync()
    $stderrTask = $server.StandardError.ReadLineAsync()

    while ($true) {
      $line = $null

      if ($null -ne $stdoutTask) {
        $stdoutTask.Wait(120) | Out-Null
        if ($stdoutTask.IsCompleted) {
          $line = $stdoutTask.Result
          if ($null -ne $line) {
            $stdoutTask = $server.StandardOutput.ReadLineAsync()
          } else {
            $stdoutTask = $null
          }
        }
      }

      if ($null -eq $line -and $null -ne $stderrTask) {
        $stderrTask.Wait(120) | Out-Null
        if ($stderrTask.IsCompleted) {
          $line = $stderrTask.Result
          if ($null -ne $line) {
            $stderrTask = $server.StandardError.ReadLineAsync()
          } else {
            $stderrTask = $null
          }
        }
      }

      if ($null -ne $line) {
        Write-ServerLine $line
        continue
      }

      if ($null -eq $stdoutTask -and $null -eq $stderrTask) { break }
      if ($server.HasExited) {
        Start-Sleep -Milliseconds 100
        try { $server.WaitForExit(2000) } catch {}
        if ($null -eq $stdoutTask -and $null -eq $stderrTask) { break }
      }
    }

    try { $exitCode = $server.ExitCode } catch { $exitCode = -1 }
    $script:ServerProcess = $null
    $runtime = 0
    try { $runtime = [int]((Get-Date) - $server.StartTime).TotalSeconds } catch { $runtime = 0 }

    if ($script:StopRequested -or $exitCode -eq 0) {
      Write-Host ""
      Write-Host "[MoonSprite] The dev server exited with code 0; stopping the supervisor."
      $keepRunning = $false
      break
    }

    Write-Host ""
    Write-Host "[MoonSprite] The dev server stopped (exit code $exitCode) after $runtime s."
    if ($attempt -ge $MaxRestarts) {
      Write-Host "[MoonSprite] Giving up after $MaxRestarts attempts."
      Write-Host "[MoonSprite] Fix the error above, then run this file again."
      $keepRunning = $false
      break
    }
    Write-Host "[MoonSprite] Recent output (last $TailLinesOnRestart lines):"
    $allLines = @(Get-Content -LiteralPath $LogPath -ErrorAction SilentlyContinue)
    $firstLine = [Math]::Max(0, $script:AttemptStartLine)
    $fresh = @($allLines | Select-Object -Skip $firstLine)
    if ($fresh.Count -eq 0) {
      Write-Host "    (no new output)"
    } else {
      foreach ($tailLine in ($fresh | Select-Object -Last $TailLinesOnRestart)) {
        Write-Host "    $tailLine"
      }
    }
    Write-Host ""
    Write-Host "[MoonSprite] Retrying in $RestartDelaySeconds s..."
    Invoke-Sleep -Seconds $RestartDelaySeconds
  }

  Stop-DevServer
  Stop-ListenerOnPort
  Write-Host ""
  Write-Host "[MoonSprite] Supervisor stopped."
  $script:LogWriter.Dispose()
  exit $exitCode
} finally {
  Stop-DevServer
  if ($null -ne $script:LogWriter) {
    try { $script:LogWriter.Dispose() } catch {}
  }
}
