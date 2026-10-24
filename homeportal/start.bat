@echo off
title HomePortal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First start: installing packages...
  call npm install --omit=dev --no-audit --no-fund
)
echo Starting HomePortal. Close this window or press Ctrl+C to stop the panel (running game servers are saved and stopped first).
node src\index.js
pause
