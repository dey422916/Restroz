# RestroZ POS Printer Setup

Automated Windows client configuration tool for **RestroZ POS Thermal Printing (80mm/58mm)** using QZ Tray.

---

## 🚀 Quick Setup Instructions for Restaurant POS PC

1. **Connect Thermal Printer**: Connect your POS80 printer to the PC via USB and power it on.
2. **Install Windows Driver**: Install the manufacturer driver for your POS80 printer.
3. **Verify Windows Test Page**: Open *Settings → Bluetooth & devices → Printers & scanners*, select **POS80**, and print a test page.
4. **Install QZ Tray**: Install QZ Tray (v2.2 or v2.3) from [https://qz.io](https://qz.io).
5. **Run Setup**: Right-click `setup.ps1` and choose **Run with PowerShell** (or run `RestroZ-Printer-Setup.exe`). Accept the Windows UAC prompt.
6. **Open RestroZ POS**:
   - Log into [https://restroz.shop](https://restroz.shop).
   - Go to **Settings → Restaurant Settings → Printer Settings**.
   - Select **POS80** for KOT and Bill printers.
   - Turn **Auto Print KOT = ON**.
   - Print a test KOT / Thermal Bill. Printing is 100% silent and instantaneous.

---

## 🔒 Security & Trust Architecture

- **Root CA Trust**: `certs/override.crt` (`CN=RestroZ Root CA`, SHA-1: `a5ed97a5f3daebfbfc7aab5b2103d63be33bd964`) is installed into QZ Tray's installation root to establish root of trust.
- **Production Leaf Certificate**: `certs/restroz-pos-production.crt` (`CN=RestroZ POS`, SHA-1: `f50c94c745587958bbb549596e3d0626ccffe4d6`) is allowlisted in QZ Tray's site manager using the official QZ console CLI.
- **Safe Conflict Handling**: If a third-party `override.crt` is already present, the setup script creates a timestamped backup (`override.crt.bak.<timestamp>`) before installing RestroZ Root CA.
- **Strictly Public Assets**: This directory contains **ONLY public certificates**. No private keys or Supabase secrets are present or distributed.

---

## 🛠️ Files

- `setup.ps1` — Automated setup script with administrator elevation, fingerprint validation, and printer detection.
- `uninstall.ps1` — Clean uninstaller that removes RestroZ Root CA and restores any pre-existing custom `override.crt` backup.
- `certs/override.crt` — RestroZ Root CA public certificate.
- `certs/restroz-pos-production.crt` — RestroZ POS production leaf public signing certificate.
