@echo off
setlocal
cd /d "%~dp0"
set "moonexe=build\aseprite-preview\moonsprite-native.exe"
if not exist "%moonexe%" set "moonexe=build\Release\moonsprite-native.exe"
if not exist "%moonexe%" (
  echo Build first: pwsh -File scripts\build.ps1
  pause
  exit /b 1
)
start "MoonSprite" "%moonexe%" --theme "%~dp0assets\themes\aseprite-default\theme.xml"
