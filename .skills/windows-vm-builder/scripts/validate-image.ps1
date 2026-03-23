# Validate a sysprep'd golden image before distribution
# Run this inside the VM BEFORE sysprep to verify readiness,
# or boot the image once after sysprep to check generalization state
#
# Usage: .\validate-image.ps1

$ErrorActionPreference = "Continue"
$errors = @()
$warnings = @()

Write-Host "=== Golden Image Validation ===" -ForegroundColor Cyan

# Check 1: Sysprep state
Write-Host "`nChecking sysprep state..."
$sysprepState = Get-ItemProperty -Path "HKLM:\SYSTEM\Setup\Status\SysprepStatus" -ErrorAction SilentlyContinue
if ($sysprepState) {
    $generalizationState = $sysprepState.GeneralizationState
    if ($generalizationState -eq 7) {
        Write-Host "  [PASS] Image is generalized (state: $generalizationState)" -ForegroundColor Green
    } else {
        $errors += "Image is NOT generalized (state: $generalizationState). Run sysprep /generalize."
        Write-Host "  [FAIL] Image is NOT generalized (state: $generalizationState)" -ForegroundColor Red
    }
} else {
    $warnings += "Cannot determine sysprep state. Registry key not found."
    Write-Host "  [WARN] Cannot determine sysprep state" -ForegroundColor Yellow
}

# Check 2: Parallels Tools
Write-Host "`nChecking Parallels Tools..."
$prlTools = Get-Service -Name "prl_tools" -ErrorAction SilentlyContinue
if ($prlTools) {
    Write-Host "  [PASS] Parallels Tools service found (Status: $($prlTools.Status))" -ForegroundColor Green
} else {
    $warnings += "Parallels Tools service not found. Tools may need reinstallation after cloning."
    Write-Host "  [WARN] Parallels Tools service not found" -ForegroundColor Yellow
}

# Check 3: No user profiles (besides default and system)
Write-Host "`nChecking user profiles..."
$profiles = Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special -and $_.LocalPath -notlike "*default*" }
if ($profiles.Count -eq 0) {
    Write-Host "  [PASS] No user profiles found (image is clean)" -ForegroundColor Green
} else {
    $profilePaths = $profiles | ForEach-Object { $_.LocalPath }
    $warnings += "User profiles found: $($profilePaths -join ', '). These will be removed during OOBE."
    Write-Host "  [WARN] Found $($profiles.Count) user profile(s): $($profilePaths -join ', ')" -ForegroundColor Yellow
}

# Check 4: WinRM is disabled (should be disabled by sysprep script)
Write-Host "`nChecking WinRM state..."
$winrm = Get-Service -Name WinRM -ErrorAction SilentlyContinue
if ($winrm -and $winrm.StartType -eq "Disabled") {
    Write-Host "  [PASS] WinRM is disabled" -ForegroundColor Green
} elseif ($winrm) {
    $warnings += "WinRM is still enabled (StartType: $($winrm.StartType)). Should be disabled for security."
    Write-Host "  [WARN] WinRM is enabled ($($winrm.StartType))" -ForegroundColor Yellow
} else {
    Write-Host "  [PASS] WinRM service not found" -ForegroundColor Green
}

# Check 5: vTPM (required for BitLocker via Intune)
Write-Host "`nChecking TPM..."
$tpm = Get-Tpm -ErrorAction SilentlyContinue
if ($tpm -and $tpm.TpmPresent) {
    Write-Host "  [PASS] TPM present and enabled" -ForegroundColor Green
} else {
    $errors += "TPM not detected. BitLocker Intune policy will fail. Enable vTPM in Parallels settings."
    Write-Host "  [FAIL] TPM not detected" -ForegroundColor Red
}

# Check 6: Network adapter present (required for Autopilot OOBE)
Write-Host "`nChecking network..."
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
if ($adapters.Count -gt 0) {
    Write-Host "  [PASS] Network adapter(s) active" -ForegroundColor Green
} else {
    $warnings += "No active network adapters found. Autopilot requires network during OOBE."
    Write-Host "  [WARN] No active network adapters" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== Validation Summary ===" -ForegroundColor Cyan
Write-Host "Errors:   $($errors.Count)" -ForegroundColor $(if ($errors.Count -gt 0) { "Red" } else { "Green" })
Write-Host "Warnings: $($warnings.Count)" -ForegroundColor $(if ($warnings.Count -gt 0) { "Yellow" } else { "Green" })

if ($errors.Count -gt 0) {
    Write-Host "`nErrors:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}
if ($warnings.Count -gt 0) {
    Write-Host "`nWarnings:" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

exit $errors.Count
