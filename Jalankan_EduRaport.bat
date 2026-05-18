@echo off
title BarRafi EduRaport Launcher
echo ===================================================
echo   MEMULAI SECURE SQLITE ENGINE - BARRAFI EDURAPORT
echo ===================================================
echo.
echo [1/2] Menjalankan Secure SQLite Backend...
start /min cmd /c "npm start"
timeout /t 2 /nobreak >nul
echo [2/2] Membuka Aplikasi BarRafi EduRaport di Browser...
start http://localhost:3005
echo.
echo ===================================================
echo   Aplikasi sukses dijalankan! 
echo   Harap biarkan jendela terminal ini tetap terbuka
echo   selama Anda menggunakan aplikasi.
echo ===================================================
echo.
pause
