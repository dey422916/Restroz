@echo off
:: ============================================================================
:: RestroZ POS Printer Setup Launcher
:: Double-click to run automated printer setup with Administrator elevation.
:: ============================================================================
title RestroZ POS Printer Setup
cd /d "%~dp0"

echo.
echo ========================================
echo        RestroZ POS Printer Setup
echo ========================================
echo Launching setup with Administrator privileges...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Setup exited with code %ERRORLEVEL%
    pause
)
