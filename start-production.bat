@echo off
title Ethiopost Content Operations Server
echo ====================================================
echo   Starting Ethiopost Content Operations Server
echo   Running locally on port 3050
echo ====================================================
cd /d "%~dp0"
node server.js
pause
