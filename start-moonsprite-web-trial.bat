@echo off
setlocal
cd /d "%~dp0"
title MoonSprite Web Trial - Hot Reload

rem Pin the target even when a desktop target is inherited from the shell.
set "MOONSPRITE_TARGET=web-trial"
set "MOONSPRITE_EXIT_CODE=1"
set "MOONSPRITE_PNPM="
set "MOONSPRITE_COREPACK="
for /f "delims=" %%P in ('where pnpm 2^>nul') do if not defined MOONSPRITE_PNPM set "MOONSPRITE_PNPM=%%P"
if not defined MOONSPRITE_PNPM if exist "%APPDATA%\npm\pnpm.cmd" set "MOONSPRITE_PNPM=%APPDATA%\npm\pnpm.cmd"
if not defined MOONSPRITE_PNPM if exist "%LOCALAPPDATA%\pnpm\pnpm.cmd" set "MOONSPRITE_PNPM=%LOCALAPPDATA%\pnpm\pnpm.cmd"
if not defined MOONSPRITE_PNPM if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" set "MOONSPRITE_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if defined MOONSPRITE_PNPM goto :check_dependencies
for /f "delims=" %%P in ('where corepack 2^>nul') do if not defined MOONSPRITE_COREPACK set "MOONSPRITE_COREPACK=%%P"
if not defined MOONSPRITE_COREPACK if exist "%ProgramFiles%\nodejs\corepack.cmd" set "MOONSPRITE_COREPACK=%ProgramFiles%\nodejs\corepack.cmd"
if defined MOONSPRITE_COREPACK goto :check_dependencies
echo [MoonSprite Web Trial] pnpm and Corepack were not found.
echo Install Node.js and pnpm, then try again.
goto :finish

:check_dependencies
if exist "%~dp0node_modules\.bin\vite.cmd" goto :start_dev
echo [MoonSprite Web Trial] Project dependencies are missing.
echo Run pnpm install --frozen-lockfile in this directory, then try again.
goto :finish

:start_dev
echo [MoonSprite Web Trial] Starting development server with hot reload.
echo Source changes update automatically while this server is running.
echo [MoonSprite Web Trial] Opening the browser trial; preferred port: 5174.
echo If the port is busy, Vite will use the next available port.
echo The actual URL is printed below and opens automatically.
echo Keep this window open. Press Ctrl+C to stop the development server.
call :run_pnpm dev:web-trial --host 127.0.0.1 --strictPort false --open /try/
set "MOONSPRITE_EXIT_CODE=%ERRORLEVEL%"
goto :finish

:run_pnpm
if defined MOONSPRITE_PNPM (
  call "%MOONSPRITE_PNPM%" %*
) else (
  call "%MOONSPRITE_COREPACK%" pnpm %*
)
exit /b %ERRORLEVEL%

:finish
if not "%MOONSPRITE_EXIT_CODE%"=="0" (
  echo.
  echo [MoonSprite Web Trial] Failed with exit code %MOONSPRITE_EXIT_CODE%.
  pause
)
exit /b %MOONSPRITE_EXIT_CODE%
