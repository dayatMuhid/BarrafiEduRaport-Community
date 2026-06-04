Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' Cek apakah bin\node.exe ada
If Not FSO.FileExists("bin\node.exe") Then
    MsgBox "ERROR: File portable engine 'bin\node.exe' tidak ditemukan!" & vbCrLf & _
           "Pastikan Anda telah mengekstrak seluruh isi file ZIP dengan benar sebelum menjalankan aplikasi.", _
           vbCritical, "BarRafi EduRaport Launcher Error"
    WScript.Quit
End If

' Jalankan server.js dengan node lokal di latar belakang dengan jendela disembunyikan (0)
WshShell.Run "cmd /c bin\node.exe server.js", 0, False
' Tunggu 2 detik agar backend siap
WScript.Sleep 2000
' Buka browser secara otomatis ke http://localhost:3005
WshShell.Run "cmd /c start http://localhost:3005", 0, False
