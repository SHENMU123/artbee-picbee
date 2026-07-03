@echo off
setlocal
set "ROOT=%~dp0"

echo ArtBee PicBee local server
echo.
echo Opening http://127.0.0.1:8787/ in a moment.
echo Keep this window open while collecting. Close it to stop the local service.
echo.

start "" cmd /c "ping 127.0.0.1 -n 3 >nul & start http://127.0.0.1:8787/"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%server.ps1" -Port 8787

endlocal
