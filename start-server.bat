@echo off
rem Escape from Work: double-click to host the game on this PC. See docs\LAN.md.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org , then double-click this again.
  pause
  exit /b 1
)
node scripts\start-server.mjs
echo.
echo The game server has stopped. You can close this window.
pause
