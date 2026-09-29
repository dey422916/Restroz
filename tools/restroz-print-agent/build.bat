@echo off
setlocal
echo [RestroZ Print Agent] Building native Windows executable...

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist %CSC% (
    set CSC="C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not exist %CSC% (
    echo Error: C# compiler csc.exe not found!
    exit /b 1
)

set OUT_DIR=%~dp0bin
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

%CSC% /target:winexe /optimize+ /platform:anycpu /out:"%OUT_DIR%\RestroZ-Print-Agent.exe" ^
    /r:System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Security.dll,System.Core.dll ^
    "%~dp0src\*.cs"

if %ERRORLEVEL% EQU 0 (
    echo [RestroZ Print Agent] Compilation successful!
    echo Output: %OUT_DIR%\RestroZ-Print-Agent.exe
) else (
    echo [RestroZ Print Agent] Compilation failed with error code %ERRORLEVEL%!
    exit /b %ERRORLEVEL%
)
