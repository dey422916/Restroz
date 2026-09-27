@echo off
:: ============================================================================
:: RestroZ POS Printer Uninstall Launcher
:: Double-click to remove RestroZ printer configuration safely.
:: ============================================================================
title RestroZ POS Printer Removal
cd /d "%~dp0"

echo.
echo ========================================
echo       RestroZ POS Printer Removal
echo ========================================
echo Launching uninstaller with Administrator privileges...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Uninstall exited with code %ERRORLEVEL%
    pause
)
