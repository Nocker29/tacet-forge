@echo off
rem Tacet Forge - serves the built app on http://localhost:4317 and opens the browser.
rem Always use this same address: your saved data (localStorage) belongs to it.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

rem Offers updates from GitHub (this fork + Wuthering Tools); skipped when offline.
rem UTF-8 console so the updater's Polish messages show correctly.
chcp 65001 >nul
where git >nul 2>nul
if not errorlevel 1 node scripts\update.mjs

if not exist "dist\index.html" (
  echo No build found - building the app first, this takes a minute...
  if not exist "node_modules" (
    call npm ci
    if errorlevel 1 goto :failed
  )
  call npm run build
  if errorlevel 1 goto :failed
)

start "" "http://localhost:4317"
node scripts\serve-dist.mjs --port 4317
exit /b 0

:failed
echo Build failed - see the messages above.
pause
exit /b 1
