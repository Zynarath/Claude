@echo off
title HomePortal
cd /d "%~dp0"
if not exist node_modules (
  echo Run install.bat first.
  pause
  exit /b 1
)
echo Starting HomePortal. Close this window or press Ctrl+C to stop the panel (running game servers are saved and stopped first).
node src\index.js
pause
