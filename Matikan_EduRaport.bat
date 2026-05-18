@echo off
title Matikan Backend BarRafi EduRaport
echo ===================================================
echo   MEMATIKAN BACKEND SERVER BARRAFI EDURAPORT
echo ===================================================
echo.
taskkill /f /im node.exe >nul 2>&1
echo Sukses! Seluruh proses backend server telah dimatikan.
echo.
echo ===================================================
pause
