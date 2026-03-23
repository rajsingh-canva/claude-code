# Run Sysprep to generalize the image for Autopilot enrollment
# This MUST be the last provisioner step — sysprep will shut down the VM
#
# CRITICAL: Do NOT include an unattend.xml that skips OOBE network setup.
# Autopilot User-Driven enrollment requires the OOBE network page to trigger.

$ErrorActionPreference = "Stop"

Write-Host "Preparing for sysprep..."

# Remove the temporary packer user profile data (will be cleaned by sysprep)
# The account itself is removed during generalization

# Clean up WinRM configuration (no longer needed after provisioning)
Write-Host "Disabling WinRM (no longer needed post-build)..."
Stop-Service WinRM -Force
Set-Service WinRM -StartupType Disabled

# Remove the WinRM firewall rule
netsh advfirewall firewall delete rule name="WinRM-HTTP" | Out-Null

# Clean up temp files
Write-Host "Cleaning up temporary files..."
Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "C:\Windows\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue

# Clear Windows Update cache
Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
Remove-Item -Path "C:\Windows\SoftwareDistribution\Download\*" -Recurse -Force -ErrorAction SilentlyContinue
Start-Service wuauserv -ErrorAction SilentlyContinue

Write-Host "Running sysprep /generalize /oobe /shutdown..."
Write-Host "The VM will shut down when sysprep completes."
Write-Host "On next boot, Windows OOBE will trigger for Autopilot User-Driven enrollment."

# Run sysprep - generalize removes machine-specific data, oobe triggers OOBE on next boot
$sysprepPath = "C:\Windows\System32\Sysprep\sysprep.exe"
$args = "/generalize /oobe /shutdown /quiet"

Start-Process -FilePath $sysprepPath -ArgumentList $args -Wait -NoNewWindow

# If we get here, sysprep didn't shut down (shouldn't happen with /shutdown flag)
Write-Warning "Sysprep process returned without shutting down. Forcing shutdown..."
Stop-Computer -Force
