# Install enterprise applications
# Customize this script with your organization's required applications
# These should be apps you want baked into the golden image (not Intune-managed apps)

$ErrorActionPreference = "Stop"

Write-Host "Installing enterprise applications..."

# Install winget (App Installer) if not present
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "Installing winget..."
    $progressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri "https://aka.ms/getwinget" -OutFile "$env:TEMP\Microsoft.DesktopAppInstaller.msixbundle"
    Add-AppxPackage -Path "$env:TEMP\Microsoft.DesktopAppInstaller.msixbundle"
}

# Example: Install common enterprise tools via winget
# Uncomment and modify as needed for your organization
#
# winget install --id Microsoft.VisualStudioCode --silent --accept-package-agreements --accept-source-agreements
# winget install --id SlackTechnologies.Slack --silent --accept-package-agreements --accept-source-agreements
# winget install --id Google.Chrome --silent --accept-package-agreements --accept-source-agreements
# winget install --id Mozilla.Firefox --silent --accept-package-agreements --accept-source-agreements

Write-Host "Enterprise application installation complete."
Write-Host "NOTE: Apps managed by Intune should NOT be installed here — they will be pushed post-enrollment."
