# Install Parallels Tools silently
# This script runs inside the VM during Packer provisioning

$ErrorActionPreference = "Stop"

Write-Host "Installing Parallels Tools..."

# Parallels Tools are mounted as a CD-ROM drive during the build
$toolsDrive = Get-Volume | Where-Object { $_.FileSystemLabel -eq "Parallels Tools" } | Select-Object -First 1

if (-not $toolsDrive) {
    # Try to find the tools installer on any removable drive
    $drives = Get-WmiObject -Class Win32_CDROMDrive | Select-Object -ExpandProperty Drive
    foreach ($drive in $drives) {
        $installer = Join-Path $drive "PTAgent.exe"
        if (Test-Path $installer) {
            Write-Host "Found Parallels Tools installer at $installer"
            Start-Process -FilePath $installer -ArgumentList "/install_silent" -Wait -NoNewWindow
            Write-Host "Parallels Tools installation complete."
            exit 0
        }
    }
    Write-Warning "Parallels Tools installer not found. Skipping installation."
    Write-Warning "You may need to install Parallels Tools manually after the build."
    exit 0
}

$driveLetter = $toolsDrive.DriveLetter
$installer = "${driveLetter}:\PTAgent.exe"

if (Test-Path $installer) {
    Start-Process -FilePath $installer -ArgumentList "/install_silent" -Wait -NoNewWindow
    Write-Host "Parallels Tools installation complete."
} else {
    Write-Warning "PTAgent.exe not found at $installer"
    exit 1
}
