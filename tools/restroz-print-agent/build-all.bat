@echo off
setlocal
echo [RestroZ Print Agent] Building Agent and Setup installer...

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist %CSC% (
    set CSC="C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

set ROOT_DIR=%~dp0
set OUT_BIN=%ROOT_DIR%bin
if not exist "%OUT_BIN%" mkdir "%OUT_BIN%"

echo 1. Compiling RestroZ-Print-Agent.exe...
%CSC% /target:winexe /optimize+ /platform:anycpu /out:"%OUT_BIN%\RestroZ-Print-Agent.exe" ^
    /r:System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Security.dll,System.Core.dll ^
    "%ROOT_DIR%src\*.cs"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Agent compilation failed!
    exit /b %ERRORLEVEL%
)

echo 2. Compiling RestroZ-Print-Agent-Setup.exe...
%CSC% /target:winexe /optimize+ /platform:anycpu /out:"%OUT_BIN%\RestroZ-Print-Agent-Setup.exe" ^
    /r:System.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Core.dll ^
    "%ROOT_DIR%installer\Setup.cs"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Setup compilation failed!
    exit /b %ERRORLEVEL%
)

copy /y "%OUT_BIN%\RestroZ-Print-Agent.exe" "%ROOT_DIR%RestroZ-Print-Agent.exe" >nul
copy /y "%OUT_BIN%\RestroZ-Print-Agent-Setup.exe" "%ROOT_DIR%RestroZ-Print-Agent-Setup.exe" >nul
copy /y "%OUT_BIN%\RestroZ-Print-Agent-Setup.exe" "%ROOT_DIR%..\..\RestroZ-Print-Agent-Setup.exe" >nul

echo [SUCCESS] RestroZ Print Agent and Setup successfully built!
echo Output: %ROOT_DIR%RestroZ-Print-Agent-Setup.exe
