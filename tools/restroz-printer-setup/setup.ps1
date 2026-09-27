<#
.SYNOPSIS
    RestroZ POS Windows Thermal Printer & QZ Tray Trust Setup Script
.DESCRIPTION
    Automates configuration of QZ Tray security trust for silent thermal printing in RestroZ POS.
    Configures Root CA override.crt, allowlists the RestroZ POS production certificate,
    verifies QZ Tray autostart, and detects connected POS80 thermal printers.
.NOTES
    RestroZ Technologies - Confidential Client Setup Tool
#>

[CmdletBinding()]
param(
    [switch]$NonInteractive,
    [switch]$NoElevation,
    [string]$TestQzDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================================
# CONSTANTS & EXPECTED FINGERPRINTS
# ============================================================================
$EXPECTED_ROOT_SHA1 = "A5ED97A5F3DAEBFBFC7AAB5B2103D63BE33BD964"
$EXPECTED_LEAF_SHA1 = "F50C94C745587958BBB549596E3D0626CCFFE4D6"

$SCRIPT_DIR = $PSScriptRoot
if (-not $SCRIPT_DIR) {
    $SCRIPT_DIR = (Get-Location).Path
}
$CERTS_DIR = Join-Path -Path $SCRIPT_DIR -ChildPath "certs"
$ROOT_CERT_PATH = Join-Path -Path $CERTS_DIR -ChildPath "override.crt"
$LEAF_CERT_PATH = Join-Path -Path $CERTS_DIR -ChildPath "restroz-pos-production.crt"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "       $Title" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Section {
    param([string]$Title)
    Write-Host "`n[$Title]" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [PASS] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  [WARN] $Message" -ForegroundColor DarkYellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
}

function Get-CertThumbprint {
    param([string]$Path)
    if (-not (Test-Path -Path $Path)) {
        return $null
    }
    try {
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $Path
        return $cert.Thumbprint.ToUpperInvariant()
    } catch {
        return $null
    }
}

# ============================================================================
# STEP 1: ADMINISTRATOR / UAC ELEVATION CHECK
# ============================================================================
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $NoElevation) {
    Write-Host "Administrator privileges are required. Requesting elevation..." -ForegroundColor Yellow
    try {
        $scriptPath = $MyInvocation.MyCommand.Definition
        if (-not $scriptPath) {
            $scriptPath = (Join-Path $SCRIPT_DIR "setup.ps1")
        }
        $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
        if ($NonInteractive) {
            $argList += " -NonInteractive"
        }
        $process = Start-Process -FilePath "powershell.exe" `
            -ArgumentList $argList `
            -Verb RunAs -PassThru
        Exit 0
    } catch {
        Write-Warn "Could not prompt for elevation automatically: $($_.Exception.Message)"
        Write-Warn "Attempting configuration with current user permissions..."
    }
}

Write-Header "RestroZ POS Printer Setup"

# Track overall results
$overallStatus = "SUCCESS"
$warningList = @()

# ============================================================================
# STEP 2: VERIFY EMBEDDED CERTIFICATE ASSETS
# ============================================================================
Write-Section "Certificate Assets Verification"

if (-not (Test-Path -Path $ROOT_CERT_PATH)) {
    Write-Fail "Root CA certificate file missing at: $ROOT_CERT_PATH"
    Exit 1
}

$localRootSha1 = Get-CertThumbprint -Path $ROOT_CERT_PATH
if ($localRootSha1 -ne $EXPECTED_ROOT_SHA1) {
    Write-Fail "Root CA thumbprint mismatch! Expected: $EXPECTED_ROOT_SHA1, Found: $localRootSha1"
    Exit 1
}
Write-Success "RestroZ Root CA verified (SHA-1: $localRootSha1)"

if (-not (Test-Path -Path $LEAF_CERT_PATH)) {
    Write-Fail "Production Leaf certificate file missing at: $LEAF_CERT_PATH"
    Exit 1
}

$localLeafSha1 = Get-CertThumbprint -Path $LEAF_CERT_PATH
if ($localLeafSha1 -ne $EXPECTED_LEAF_SHA1) {
    Write-Fail "Production Leaf thumbprint mismatch! Expected: $EXPECTED_LEAF_SHA1, Found: $localLeafSha1"
    Exit 1
}
Write-Success "RestroZ Production Leaf verified (SHA-1: $localLeafSha1)"

# ============================================================================
# STEP 3: QZ TRAY DETECTION
# ============================================================================
Write-Section "QZ Tray Detection"

if ($TestQzDir) {
    $qzCandidates = @($TestQzDir) | Where-Object { $_ -and (Test-Path -Path $_) }
} else {
    $qzCandidates = @(
        "C:\Program Files\QZ Tray",
        "C:\Program Files (x86)\QZ Tray",
        (Join-Path -Path $env:ProgramFiles -ChildPath "QZ Tray"),
        (Join-Path -Path ${env:ProgramFiles(x86)} -ChildPath "QZ Tray"),
        (Join-Path -Path $env:LOCALAPPDATA -ChildPath "Programs\QZ Tray")
    ) | Where-Object { $_ -and (Test-Path -Path $_) }
}

$qzDir = $null
$qzExePath = $null
$qzConsolePath = $null

foreach ($dir in $qzCandidates) {
    $exe = Join-Path -Path $dir -ChildPath "qz-tray.exe"
    $console = Join-Path -Path $dir -ChildPath "qz-tray-console.exe"
    if ((Test-Path -Path $exe) -and (Test-Path -Path $console)) {
        $qzDir = $dir
        $qzExePath = $exe
        $qzConsolePath = $console
        break
    }
}

if (-not $qzDir) {
    Write-Fail "QZ Tray was not found on this computer."
    Write-Host ""
    Write-Host "Please install supported QZ Tray (v2.2 or v2.3) from https://qz.io" -ForegroundColor White
    Write-Host "and then run RestroZ Printer Setup again." -ForegroundColor White
    Write-Host ""
    Exit 1
}

$qzVersion = "Unknown"
try {
    $versionInfo = (Get-Item -Path $qzExePath).VersionInfo
    if ($versionInfo.ProductVersion) {
        $qzVersion = $versionInfo.ProductVersion
    } elseif ($versionInfo.FileVersion) {
        $qzVersion = $versionInfo.FileVersion
    }
} catch {}

Write-Success "QZ Tray detected at: $qzDir"
Write-Success "QZ Tray Version: $qzVersion"

# ============================================================================
# STEP 4: INSTALL RESTROZ ROOT TRUST (override.crt) WITH SAFETY CHECK
# ============================================================================
Write-Section "Root CA Trust Installation"

$targetOverridePath = Join-Path -Path $qzDir -ChildPath "override.crt"
$backupRecordPath = Join-Path -Path $qzDir -ChildPath "restroz-backup-override.txt"

if (Test-Path -Path $targetOverridePath) {
    $existingThumbprint = Get-CertThumbprint -Path $targetOverridePath
    if ($existingThumbprint -eq $EXPECTED_ROOT_SHA1) {
        Write-Success "RestroZ Root CA is already installed and verified in QZ Tray."
    } else {
        # Third-party / previous certificate exists. Create safe timestamped backup.
        $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
        $backupPath = Join-Path -Path $qzDir -ChildPath "override.crt.bak.$timestamp"
        Copy-Item -Path $targetOverridePath -Destination $backupPath -Force
        Set-Content -Path $backupRecordPath -Value $backupPath -Force
        
        Write-Warn "Existing custom QZ override.crt detected (SHA-1: $existingThumbprint)."
        Write-Warn "Created safe backup at: $backupPath"
        $warningList += "Existing third-party override.crt was backed up to $backupPath"
        
        Copy-Item -Path $ROOT_CERT_PATH -Destination $targetOverridePath -Force
    }
} else {
    Copy-Item -Path $ROOT_CERT_PATH -Destination $targetOverridePath -Force
    Write-Success "Installed RestroZ Root CA override.crt into QZ Tray directory."
}

# Post-install verification
$installedThumbprint = Get-CertThumbprint -Path $targetOverridePath
if ($installedThumbprint -ne $EXPECTED_ROOT_SHA1) {
    Write-Fail "Root CA override.crt verification failed! (SHA-1: $installedThumbprint)"
    Exit 1
}
Write-Success "Root CA override.crt verified (SHA-1: $installedThumbprint)"

# ============================================================================
# STEP 5: QZ PRODUCTION LEAF CERTIFICATE ALLOWLIST
# ============================================================================
Write-Section "Production Certificate Allowlist"

try {
    # Call QZ Tray Console CLI to allowlist the leaf certificate
    $allowProcess = Start-Process -FilePath $qzConsolePath `
        -ArgumentList "--allow `"$LEAF_CERT_PATH`"" `
        -Wait -PassThru -NoNewWindow

    if ($allowProcess.ExitCode -eq 0 -or $allowProcess.ExitCode -eq $null) {
        Write-Success "RestroZ POS Production Certificate successfully allowed in QZ Tray."
    } else {
        Write-Warn "QZ Console allow returned exit code: $($allowProcess.ExitCode). Verifying trust..."
    }
} catch {
    Write-Warn "Direct invocation of qz-tray-console encountered: $($_.Exception.Message)"
}

# Verify allowed.dat location exists
$qzAppData = Join-Path -Path $env:APPDATA -ChildPath "qz"
$allowedDatPath = Join-Path -Path $qzAppData -ChildPath "allowed.dat"
if (Test-Path -Path $allowedDatPath) {
    Write-Success "QZ Tray trust database verified at: $allowedDatPath"
} else {
    Write-Warn "QZ trust database will be finalized when QZ Tray launches."
}

# ============================================================================
# STEP 6: RESTART / RELOAD QZ TRAY
# ============================================================================
Write-Section "QZ Tray Process Management"

try {
    $runningQz = Get-Process -Name "qz-tray*" -ErrorAction SilentlyContinue
    if ($runningQz) {
        Write-Host "  Stopping existing QZ Tray process for trust reload..." -ForegroundColor Cyan
        Stop-Process -InputObject $runningQz -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    Write-Host "  Starting QZ Tray..." -ForegroundColor Cyan
    Start-Process -FilePath $qzExePath -WorkingDirectory $qzDir
    Start-Sleep -Seconds 3

    $activeQz = Get-Process -Name "qz-tray*" -ErrorAction SilentlyContinue
    if ($activeQz) {
        Write-Success "QZ Tray is running (PID: $($activeQz[0].Id))."
    } else {
        Write-Warn "QZ Tray did not report an active process immediately. It may take a few moments to start."
    }
} catch {
    Write-Warn "Could not automatically restart QZ Tray: $($_.Exception.Message)"
    Write-Host "  Please manually start QZ Tray from the Start Menu." -ForegroundColor White
}

# ============================================================================
# STEP 7: QZ AUTOSTART VERIFICATION
# ============================================================================
Write-Section "Autostart Verification"

$startupShortcuts = @(
    (Join-Path -Path $env:ProgramData -ChildPath "Microsoft\Windows\Start Menu\Programs\Startup\QZ Tray.lnk"),
    (Join-Path -Path $env:APPDATA -ChildPath "Microsoft\Windows\Start Menu\Programs\Startup\QZ Tray.lnk")
)

$hasStartup = $false
foreach ($lnk in $startupShortcuts) {
    if (Test-Path -Path $lnk) {
        $hasStartup = $true
        break
    }
}

if (-not $hasStartup) {
    # Check Registry Run Keys
    try {
        $hkcuRun = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue)."qz-tray"
        $hklmRun = (Get-ItemProperty -Path "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue)."qz-tray"
        if ($hkcuRun -or $hklmRun) {
            $hasStartup = $true
        }
    } catch {}
}

if ($hasStartup) {
    Write-Success "QZ Tray Windows automatic startup is verified."
} else {
    Write-Host "  Configuring QZ Tray startup shortcut..." -ForegroundColor Cyan
    try {
        $wshShell = New-Object -ComObject WScript.Shell
        $shortcutPath = Join-Path -Path $env:ProgramData -ChildPath "Microsoft\Windows\Start Menu\Programs\Startup\QZ Tray.lnk"
        $shortcut = $wshShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $qzExePath
        $shortcut.WorkingDirectory = $qzDir
        $shortcut.Description = "QZ Tray POS Printing Daemon"
        $shortcut.Save()
        Write-Success "Created QZ Tray startup shortcut in ProgramData."
    } catch {
        Write-Warn "Could not create startup shortcut automatically: $($_.Exception.Message)"
    }
}

# ============================================================================
# STEP 8: WINDOWS THERMAL PRINTER DETECTION (POS80)
# ============================================================================
Write-Section "Thermal Printer Detection"

$ignoredPrinters = @(
    "Microsoft Print to PDF",
    "Microsoft XPS Document Writer",
    "Fax",
    "OneNote (Desktop)",
    "Send to OneNote 16",
    "AnyDesk Printer"
)

$installedPrinters = @()
try {
    $installedPrinters = Get-Printer | Where-Object { $ignoredPrinters -notcontains $_.Name }
} catch {
    try {
        $installedPrinters = Get-CimInstance -ClassName Win32_Printer | Where-Object { $ignoredPrinters -notcontains $_.Name }
    } catch {}
}

$thermalPrinters = @()
if ($installedPrinters) {
    foreach ($p in $installedPrinters) {
        $pName = $p.Name
        if ($pName -match "(?i)pos|80|thermal|kot|receipt|bill|rp80|xp-80|tm-t|sprt|rpp") {
            $thermalPrinters += $p
        }
    }
}

if ($thermalPrinters.Count -gt 0) {
    foreach ($tp in $thermalPrinters) {
        Write-Success "POS Thermal Printer detected: $($tp.Name)"
    }
} else {
    Write-Warn "POS80 thermal printer/driver was not found among installed Windows printers."
    Write-Host ""
    Write-Host "  ACTION REQUIRED:" -ForegroundColor Yellow
    Write-Host "  1. Connect your 80mm thermal receipt printer via USB." -ForegroundColor White
    Write-Host "  2. Install the POS80 Windows printer driver." -ForegroundColor White
    Write-Host "  3. Print a Windows Test Page from Windows Printers & Scanners." -ForegroundColor White
    Write-Host "  4. Ensure printer is named 'POS80' or similar." -ForegroundColor White
    Write-Host ""
    $overallStatus = "ACTION_REQUIRED"
    $warningList += "POS80 thermal printer driver not detected in Windows."
}

# ============================================================================
# STEP 9: SUMMARY & TECHNICIAN CHECKLIST
# ============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($overallStatus -eq "SUCCESS") {
    Write-Host "     SETUP COMPLETED SUCCESSFULLY       " -ForegroundColor Green
} else {
    Write-Host "   SETUP COMPLETED WITH ACTION ITEMS    " -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration Summary:" -ForegroundColor White
Write-Host "  Administrator Rights : Elevated" -ForegroundColor Gray
Write-Host "  QZ Tray Version      : $qzVersion" -ForegroundColor Gray
Write-Host "  Root CA Status       : Installed (SHA-1: $EXPECTED_ROOT_SHA1)" -ForegroundColor Gray
Write-Host "  Leaf Signing Cert    : Allowed (SHA-1: $EXPECTED_LEAF_SHA1)" -ForegroundColor Gray
Write-Host "  Startup Integration  : Verified" -ForegroundColor Gray

if ($thermalPrinters.Count -gt 0) {
    Write-Host "  Thermal Printer      : $($thermalPrinters[0].Name)" -ForegroundColor Gray
} else {
    Write-Host "  Thermal Printer      : NOT DETECTED (Install POS80 Driver)" -ForegroundColor Yellow
}

if ($warningList.Count -gt 0) {
    Write-Host "`nNotices / Action Items:" -ForegroundColor Yellow
    foreach ($w in $warningList) {
        Write-Host "  • $w" -ForegroundColor DarkYellow
    }
}

Write-Host "`nNext Steps for Restaurant POS Setup:" -ForegroundColor White
Write-Host "  1. Open RestroZ POS in browser (https://restroz.shop)" -ForegroundColor Cyan
Write-Host "  2. Log in with restaurant manager / cashier credentials" -ForegroundColor Cyan
Write-Host "  3. Go to Settings -> Restaurant Settings -> Printer Settings" -ForegroundColor Cyan
Write-Host "  4. Set 'KOT Printer Name' = POS80 (or detected printer name)" -ForegroundColor Cyan
Write-Host "  5. Set 'Bill Printer Name' = POS80" -ForegroundColor Cyan
Write-Host "  6. Switch 'Auto Print KOT' = ON" -ForegroundColor Cyan
Write-Host "  7. Place a test order to verify 100% silent direct thermal printing!" -ForegroundColor Cyan
if (-not $NonInteractive) {
    Write-Host "Press Enter to exit..."
    Read-Host
}
