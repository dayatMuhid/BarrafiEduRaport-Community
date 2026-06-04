@echo off
title BarRafi EduRaport Launcher
echo ===================================================
echo   MEMULAI SECURE SQLITE ENGINE - BARRAFI EDURAPORT
echo ===================================================
echo.

rem Cek apakah file node.exe lokal ada di folder bin
if not exist "bin\node.exe" (
    echo ERROR: File portable engine 'bin\node.exe' tidak ditemukan!
    echo Silakan pastikan Anda telah mengekstrak seluruh file ZIP dengan benar.
    echo.
    pause
    exit
)

echo [1/2] Menjalankan Secure SQLite Backend...
start /min cmd /c "bin\node.exe server.js"
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
