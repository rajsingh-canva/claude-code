# Extract Windows Autopilot hardware hash from a running VM
# Outputs JSON for programmatic consumption
#
# Usage: Run this script inside a Windows VM before sysprep
#   .\extract-hwid.ps1
#   .\extract-hwid.ps1 -OutputFile "hwid.json"

param(
    [string]$OutputFile = ""
)

$ErrorActionPreference = "Stop"

# Install Get-WindowsAutopilotInfo if not present
if (-not (Get-Command Get-WindowsAutopilotInfo -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Get-WindowsAutopilotInfo..."
    Install-Script -Name Get-WindowsAutopilotInfo -Force -Scope CurrentUser
}

# Extract the hardware hash
Write-Host "Extracting hardware hash..."
$session = New-CimSession
$serial = (Get-CimInstance -CimSession $session -Namespace "root/cimv2/mdm/dmmap" -ClassName "MDM_DevDetail_Ext01" -Filter "InstanceID='Ext' AND ParentID='./DevDetail'").DeviceHardwareData
$devDetail = Get-CimInstance -CimSession $session -Namespace "root/cimv2/mdm/dmmap" -ClassName "MDM_DevDetail_Ext01" -Filter "InstanceID='Ext' AND ParentID='./DevDetail'"

$computerInfo = Get-CimInstance -ClassName Win32_ComputerSystemProduct

$result = @{
    serialNumber = $computerInfo.IdentifyingNumber
    hardwareHash = $devDetail.DeviceHardwareData
    manufacturer = $computerInfo.Vendor
    model        = $computerInfo.Name
    timestamp    = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
}

$json = $result | ConvertTo-Json -Depth 2

if ($OutputFile) {
    $json | Out-File -FilePath $OutputFile -Encoding UTF8
    Write-Host "Hardware hash saved to $OutputFile"
} else {
    Write-Output $json
}
