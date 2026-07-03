@echo off
setlocal
set "ROOT=%~dp0"
set "PORT=8787"

echo.
echo ArtBee PicBee old-cache recovery mode: %PORT%
echo.
echo This opens the old address so Chrome can read any old local cache for this port.
echo If old images appear, keep this window open for 10 seconds so the app can write artbee-library.json.
echo.

start "" cmd /c "ping 127.0.0.1 -n 3 >nul & start http://127.0.0.1:%PORT%/"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%server.ps1" -Port %PORT% -HostAddress 127.0.0.1

endlocal
