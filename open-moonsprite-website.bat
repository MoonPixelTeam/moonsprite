@echo off
setlocal EnableExtensions
cd /d "%~dp0website"
call "%~dp0website\打开MoonSprite官网.bat" %*
exit /b %ERRORLEVEL%
