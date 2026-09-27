<#
.SYNOPSIS
    RestroZ POS Windows Thermal Printer & QZ Tray Trust Removal Script
.DESCRIPTION
    Safely removes RestroZ-specific QZ Tray configuration.
    Restores any backed-up override.crt if present, or removes the RestroZ Root CA.
    Does NOT delete QZ Tray, printer drivers, or unrelated certificate settings.
.NOTES
    RestroZ Technologies - Client Setup Tool
#>

[CmdletBinding()]
param(
    [switch]$NonInteractive,
    [switch]$NoElevation,
    [string]$TestQzDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$EXPECTED_ROOT_SHA1 = "A5ED97A5F3DAEBFBFC7AAB5B2103D63BE33BD964"

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
# STEP 1: ADMINISTRATOR CHECK
# ============================================================================
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $NoElevation) {
    Write-Host "Administrator privileges are required. Requesting elevation..." -ForegroundColor Yellow
    try {
        $scriptPath = $MyInvocation.MyCommand.Definition
        if (-not $scriptPath) {
            $scriptPath = (Join-Path (Get-Location).Path "uninstall.ps1")
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
        Write-Warn "Attempting removal with current user permissions..."
    }
}

Write-Header "RestroZ Printer Setup Removal"

# ============================================================================
# STEP 2: LOCATE QZ TRAY
# ============================================================================
Write-Section "QZ Tray Location"

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
foreach ($dir in $qzCandidates) {
    if (Test-Path -Path (Join-Path -Path $dir -ChildPath "qz-tray.exe")) {
        $qzDir = $dir
        break
    }
}

if (-not $qzDir) {
    Write-Warn "QZ Tray directory not found. No configuration to remove."
    Exit 0
}

Write-Success "Found QZ Tray at: $qzDir"

# ============================================================================
# STEP 3: REMOVE OR RESTORE override.crt
# ============================================================================
Write-Section "Root CA override.crt Clean Up"

$targetOverridePath = Join-Path -Path $qzDir -ChildPath "override.crt"
$backupRecordPath = Join-Path -Path $qzDir -ChildPath "restroz-backup-override.txt"

if (Test-Path -Path $targetOverridePath) {
    $currentThumbprint = Get-CertThumbprint -Path $targetOverridePath
    
    # Check if a backup of a pre-existing override.crt was recorded
    $restored = $false
    if (Test-Path -Path $backupRecordPath) {
        $backupFile = (Get-Content -Path $backupRecordPath -Raw).Trim()
        if (Test-Path -Path $backupFile) {
            Write-Host "  Restoring original pre-existing override.crt from backup..." -ForegroundColor Cyan
            Copy-Item -Path $backupFile -Destination $targetOverridePath -Force
            Remove-Item -Path $backupRecordPath -Force -ErrorAction SilentlyContinue
            Write-Success "Restored original override.crt from: $backupFile"
            $restored = $true
        }
    }
    
    if (-not $restored) {
        if ($currentThumbprint -eq $EXPECTED_ROOT_SHA1) {
            Write-Host "  Removing RestroZ Root CA override.crt..." -ForegroundColor Cyan
            Remove-Item -Path $targetOverridePath -Force
            Write-Success "RestroZ Root CA override.crt removed."
        } else {
            Write-Warn "Current override.crt does not belong to RestroZ (SHA-1: $currentThumbprint). Leaving untouched."
        }
    }
} else {
    Write-Success "No override.crt found in QZ Tray directory."
}

# ============================================================================
# STEP 4: RESTART QZ TRAY
# ============================================================================
Write-Section "Restarting QZ Tray"

try {
    $runningQz = Get-Process -Name "qz-tray*" -ErrorAction SilentlyContinue
    if ($runningQz) {
        Stop-Process -InputObject $runningQz -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }

    $qzExePath = Join-Path -Path $qzDir -ChildPath "qz-tray.exe"
    if (Test-Path -Path $qzExePath) {
        Start-Process -FilePath $qzExePath -WorkingDirectory $qzDir
        Start-Sleep -Seconds 2
        Write-Success "QZ Tray restarted."
    }
} catch {
    Write-Warn "Could not restart QZ Tray automatically: $($_.Exception.Message)"
}

# ============================================================================
# STEP 5: MANUAL SITE MANAGER GUIDANCE
# ============================================================================
Write-Section "Site Manager Allowlist Removal"

Write-Host "  NOTE: To remove the RestroZ POS entry from QZ Site Manager:" -ForegroundColor White
Write-Host "  1. Right-click the QZ Tray icon in the Windows taskbar." -ForegroundColor Gray
Write-Host "  2. Go to Automatically Allow -> Allowed." -ForegroundColor Gray
Write-Host "  3. Select 'RestroZ POS' and click Remove/Delete." -ForegroundColor Gray

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   RESTROZ CONFIGURATION REMOVED       " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
if (-not $NonInteractive) {
    Write-Host "Press Enter to exit..."
    Read-Host
}
