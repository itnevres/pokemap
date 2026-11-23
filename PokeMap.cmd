@echo off
rem Double-click to start PokeMap. Keep this window open while you work; closing it stops PokeMap.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo PokeMap needs Node.js, and it is not installed on this computer.
  echo Install the current LTS version from https://nodejs.org , then double-click PokeMap again.
  pause
  exit /b 1
)
node scripts\launch.mjs %*
if errorlevel 1 pause
