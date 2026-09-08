@echo off
setlocal

cd /d "%~dp0"
title MoonSprite Development

echo [MoonSprite] Starting the Tauri development app...
echo [MoonSprite] Keep this window open while using MoonSprite.
echo.

set "MOONSPRITE_APP_PID="
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Get-Process -Name moonsprite -ErrorAction SilentlyContinue).Id"') do if not defined MOONSPRITE_APP_PID set "MOONSPRITE_APP_PID=%%P"
if defined MOONSPRITE_APP_PID (
  echo [MoonSprite] The development app is already running.
  echo Close the existing app before starting it again.
  exit /b 0
)

set "MOONSPRITE_PORT_PID="
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue).OwningProcess"') do if not defined MOONSPRITE_PORT_PID set "MOONSPRITE_PORT_PID=%%P"
if defined MOONSPRITE_PORT_PID (
  echo [MoonSprite] Port 5173 is already in use by process %MOONSPRITE_PORT_PID%.
  echo Close that process or free port 5173, then try again.
  pause
  exit /b 2
)

set "PNPM_COMMAND="
for /f "delims=" %%P in ('where pnpm 2^>nul') do if not defined PNPM_COMMAND set "PNPM_COMMAND=%%P"

if not defined PNPM_COMMAND if exist "%APPDATA%\npm\pnpm.cmd" set "PNPM_COMMAND=%APPDATA%\npm\pnpm.cmd"
if not defined PNPM_COMMAND if exist "%LOCALAPPDATA%\pnpm\pnpm.cmd" set "PNPM_COMMAND=%LOCALAPPDATA%\pnpm\pnpm.cmd"
if not defined PNPM_COMMAND if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" set "PNPM_COMMAND=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if defined PNPM_COMMAND goto :start_with_pnpm

if exist "%ProgramFiles%\nodejs\corepack.cmd" (
  set "COREPACK_HOME=%LOCALAPPDATA%\MoonSprite\corepack"
  set "PROJECT_DIRECTORY=%~dp0"
  set "LOCAL_BIN_DIRECTORY=%PROJECT_DIRECTORY%node_modules\.bin"
  set "PATH=%LOCAL_BIN_DIRECTORY%;%PATH%"
  echo [MoonSprite] pnpm was not found directly. Using Corepack.
  if not exist "%LOCAL_BIN_DIRECTORY%\tauri.cmd" (
    echo [MoonSprite] Local Tauri CLI link is missing. Repairing dependencies...
    call "%ProgramFiles%\nodejs\corepack.cmd" pnpm rebuild
    if not exist "%LOCAL_BIN_DIRECTORY%\tauri.cmd" (
      call "%ProgramFiles%\nodejs\corepack.cmd" pnpm install --frozen-lockfile
    )
  )
  if not exist "%LOCAL_BIN_DIRECTORY%\tauri.cmd" (
    echo [MoonSprite] Tauri CLI was not found in the project dependencies.
    echo Run pnpm install in this directory, then try again.
    set "MOONSPRITE_EXIT_CODE=1"
    goto :finish
  )
  call "%ProgramFiles%\nodejs\corepack.cmd" pnpm dev
  set "MOONSPRITE_EXIT_CODE=%ERRORLEVEL%"
  goto :finish
)

echo [MoonSprite] pnpm and Corepack were not found.
echo Install Node.js with Corepack or install pnpm, then try again.
pause
exit /b 1

:start_with_pnpm
for %%P in ("%PNPM_COMMAND%") do set "PNPM_DIRECTORY=%%~dpP"
set "PROJECT_DIRECTORY=%~dp0"
set "LOCAL_BIN_DIRECTORY=%PROJECT_DIRECTORY%node_modules\.bin"
set "PATH=%LOCAL_BIN_DIRECTORY%;%PNPM_DIRECTORY%;%PATH%"
echo [MoonSprite] Using pnpm: %PNPM_COMMAND%

rem pnpm can leave the workspace links without .bin entries after a copied or
rem interrupted install. Rebuild the links before starting the Tauri script.
if not exist "%LOCAL_BIN_DIRECTORY%\tauri.cmd" (
  echo [MoonSprite] Local Tauri CLI link is missing. Repairing dependencies...
  call "%PNPM_COMMAND%" rebuild
  if not exist "%LOCAL_BIN_DIRECTORY%\tauri.cmd" (
    echo [MoonSprite] Tauri CLI is still missing. Installing dependencies...
    call "%PNPM_COMMAND%" install --frozen-lockfile
  )
)

if not exist "%LOCAL_BIN_DIRECTORY%\tauri.cmd" (
  echo [MoonSprite] Tauri CLI was not found in the project dependencies.
  echo Run pnpm install in this directory, then try again.
  set "MOONSPRITE_EXIT_CODE=1"
  goto :finish
)

call "%PNPM_COMMAND%" dev
set "MOONSPRITE_EXIT_CODE=%ERRORLEVEL%"

:finish
if not "%MOONSPRITE_EXIT_CODE%"=="0" (
  echo.
  echo [MoonSprite] Startup failed with exit code %MOONSPRITE_EXIT_CODE%.
  pause
)

exit /b %MOONSPRITE_EXIT_CODE%
