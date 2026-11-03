@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Download from https://nodejs.org
  pause
  exit /b 1
)
if not exist data mkdir data
if not defined PORT set PORT=3000
if not exist data\app.db (
  echo First run: seeding database...
  node server\seed.js
)
echo Starting Company A Motors on http://localhost:%PORT%
start "" "http://localhost:%PORT%"
node server\server.js
pause
