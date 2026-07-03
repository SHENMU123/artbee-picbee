@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
set "APP_ROOT=%~dp0.."
set "PORT=8791"
set "HOST=0.0.0.0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found. Please install Node.js first, then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo ArtBee PicBee LAN mode is running.
echo.
echo On this computer:
echo   http://127.0.0.1:%PORT%/
echo.
echo On another computer or phone in the same Wi-Fi, try one of these addresses:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i "IPv4"') do (
  set "IP=%%A"
  set "IP=!IP: =!"
  if not "!IP!"=="" echo   http://!IP!:%PORT%/
)
echo.
echo If Windows Firewall asks, allow access on Private networks.
echo Keep this window open while using LAN mode. Close it to stop the site.
echo.

start "" cmd /c "ping 127.0.0.1 -n 3 >nul & start http://127.0.0.1:%PORT%/"
pushd "%APP_ROOT%"
node server.js
popd

endlocal
