Set WshShell = CreateObject("WScript.Shell")
' Jalankan npm start di latar belakang dengan jendela disembunyikan (0)
WshShell.Run "cmd /c npm start", 0, False
' Tunggu 2 detik agar backend siap
WScript.Sleep 2000
' Buka browser secara otomatis ke http://localhost:3005
WshShell.Run "cmd /c start http://localhost:3005", 0, False
