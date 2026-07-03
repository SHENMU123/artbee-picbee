@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
if "%ADMIN_USER%"=="" set "ADMIN_USER=admin"
if "%ADMIN_PASSWORD%"=="" set "ADMIN_PASSWORD=picbee2026"
if "%SESSION_SECRET%"=="" set "SESSION_SECRET=local-dev-change-me"
if "%PORT%"=="" set "PORT=8787"
if "%HOST%"=="" set "HOST=0.0.0.0"
npm start
endlocal
