@echo off
setlocal EnableExtensions

cd /d "%~dp0"

title MoonSprite Website
set "MOONSPRITE_WEBSITE_URL=http://127.0.0.1:4174"
set "MOONSPRITE_WEBSITE_PORT=4174"
set "MOONSPRITE_SUPERVISOR=%~dp0scripts\website-dev-supervisor.ps1"

rem /check only reports whether the website already answers on the website port.
set "MOONSPRITE_CHECK_ONLY="
if /i "%~1"=="/check" set "MOONSPRITE_CHECK_ONLY=1"

if not exist "%MOONSPRITE_SUPERVISOR%" (
  echo [MoonSprite] Missing "%MOONSPRITE_SUPERVISOR%".
  echo Keep the website\scripts folder next to this file.
  echo.
  pause
  exit /b 1
)

call :configure_website
if not defined WEBSITE_WORKING_DIRECTORY (
  echo [MoonSprite] website\package.json was not found.
  echo Put this file in the project root or the website folder.
  echo.
  pause
  exit /b 1
)

rem A live site opens right away; anything else (including a wedged listener that
rem still holds the port) goes through the supervisor, which reclaims the port.
call :is_serving
if not errorlevel 1 (
  start "" "%MOONSPRITE_WEBSITE_URL%"
  exit /b 0
)

if defined MOONSPRITE_CHECK_ONLY exit /b 1

call :find_package_runner
if not defined PNPM_COMMAND if not defined COREPACK_COMMAND (
  echo [MoonSprite] pnpm or Corepack was not found.
  echo Install Node.js and pnpm, then try again.
  echo.
  pause
  exit /b 1
)

rem Node writes UTF-8 diagnostics, so the console has to follow.
chcp 65001 >nul 2>nul

echo [MoonSprite] Starting the website: %MOONSPRITE_WEBSITE_URL%
echo [MoonSprite] Editing code may restart the dev server; this window restarts it automatically.
echo.

if defined PNPM_COMMAND (
  set "MOONSPRITE_COMMAND=%PNPM_COMMAND%"
) else (
  set "MOONSPRITE_COMMAND=%COREPACK_COMMAND%"
  set "MOONSPRITE_EXTRA=pnpm"
)

rem The runner path may contain spaces and is quoted again by the supervisor.
set "MOONSPRITE_COMMAND_LINE=%MOONSPRITE_COMMAND% %MOONSPRITE_EXTRA% %WEBSITE_SCRIPT% --host 127.0.0.1 --port %MOONSPRITE_WEBSITE_PORT% --strictPort"
set "MOONSPRITE_COMMAND_LINE=%MOONSPRITE_COMMAND_LINE:"=%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%MOONSPRITE_SUPERVISOR%" -WorkingDirectory "%~dp0." -CommandLine "%MOONSPRITE_COMMAND_LINE%" -Url "%MOONSPRITE_WEBSITE_URL%" -TakeOverPort
set "MOONSPRITE_SUPERVISOR_EXIT=%ERRORLEVEL%"

echo.
if not "%MOONSPRITE_SUPERVISOR_EXIT%"=="0" (
  echo [MoonSprite] The dev server stopped with code %MOONSPRITE_SUPERVISOR_EXIT%.
  echo Check the messages above, then run this file again.
  echo.
  pause
)
exit /b %MOONSPRITE_SUPERVISOR_EXIT%

:configure_website
set "WEBSITE_WORKING_DIRECTORY="
set "WEBSITE_SCRIPT="

if exist "%~dp0website\package.json" (
  set "WEBSITE_WORKING_DIRECTORY=%~dp0"
  set "WEBSITE_SCRIPT=website:dev"
  exit /b 0
)

if exist "%~dp0package.json" (
  set "WEBSITE_WORKING_DIRECTORY=%~dp0"
  set "WEBSITE_SCRIPT=dev"
)
exit /b 0

:find_package_runner
set "PNPM_COMMAND="
set "COREPACK_COMMAND="

for /f "delims=" %%P in ('where pnpm.cmd 2^>nul') do if not defined PNPM_COMMAND set "PNPM_COMMAND=%%P"
if not defined PNPM_COMMAND if exist "%APPDATA%\npm\pnpm.cmd" set "PNPM_COMMAND=%APPDATA%\npm\pnpm.cmd"
if not defined PNPM_COMMAND if exist "%LOCALAPPDATA%\pnpm\pnpm.cmd" set "PNPM_COMMAND=%LOCALAPPDATA%\pnpm\pnpm.cmd"
if not defined PNPM_COMMAND if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" set "PNPM_COMMAND=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if not defined PNPM_COMMAND if exist "%ProgramFiles%\nodejs\corepack.cmd" set "COREPACK_COMMAND=%ProgramFiles%\nodejs\corepack.cmd"
exit /b 0

:is_serving
rem A wedged dev server can answer one request and then go silent, so probe twice.
call :probe_website
if errorlevel 1 exit /b 1
>nul ping 127.0.0.1 -n 2
call :probe_website
exit /b %ERRORLEVEL%

:probe_website
rem A port can stay occupied by a wedged dev server, which never answers HTTP.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort %MOONSPRITE_WEBSITE_PORT% -State Listen -ErrorAction SilentlyContinue) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri '%MOONSPRITE_WEBSITE_URL%'; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch { } }; exit 1" 2>nul
exit /b %ERRORLEVEL%
