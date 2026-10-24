@echo off
title HomePortal update
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Get it from https://git-scm.com/download/win and run this again.
  pause
  exit /b 1
)
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo This folder isn't a Git copy of the repository yet. See "Updating" in README.md.
  pause
  exit /b 1
)
echo Downloading the latest version...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Update failed. If you edited files in this folder, Git won't overwrite them - see the message above.
  pause
  exit /b 1
)
echo Installing any new packages...
call npm install --omit=dev --no-audit --no-fund
echo.
echo Done. If HomePortal is running, close its window and start it again with start.bat.
echo (Your servers, settings and accounts in the data folder are kept.)
pause
