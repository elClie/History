@echo off
setlocal
cd /d "%~dp0"

rem Prefer npm.cmd — PowerShell often blocks npm.ps1 via ExecutionPolicy
set "NPM=npm.cmd"
where npm.cmd >nul 2>&1
if errorlevel 1 set "NPM=npm"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies...
  call %NPM% install
  if errorlevel 1 (
    echo.
    echo Install failed. Install Node.js from https://nodejs.org then try again.
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron binary missing after install.
  echo Try:  %NPM% install electron@33.2.0 --save-dev
  pause
  exit /b 1
)

rem path.txt MUST be exactly "electron.exe" with no CR/LF (Windows Electron bug)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'node_modules\electron\path.txt'), 'electron.exe')"

echo Starting HisTML...
call %NPM% start
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo App exited with error %ERR%.
  pause
)
exit /b %ERR%
