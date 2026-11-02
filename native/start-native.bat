@echo off
setlocal
set "moonLaunchCwd=%CD%"
set "moonexe=%~dp0build\Release\moonsprite-native.exe"
if not exist "%moonexe%" (
  echo Build first: pwsh -File scripts\bootstrap.ps1
  echo Then: pwsh -File scripts\build.ps1
  pause
  exit /b 1
)
start "MoonSprite Native" /D "%moonLaunchCwd%" "%moonexe%" --theme "%~dp0assets\themes\moonsprite-dark\theme.xml" --cursors "%~dp0assets\cursors" %*
