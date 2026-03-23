# Troubleshooting Guide

## Packer Build Failures

### WinRM connection timeout
**Symptom:** Packer waits for WinRM and eventually times out.
**Causes:**
- autounattend.xml not detected by Windows installer (check floppy mount)
- WinRM not enabled in FirstLogonCommands
- Firewall blocking port 5985
- Auto-logon not triggering (check credentials match)
**Fix:** Boot the VM manually and check if the `packer` user exists and WinRM is running (`winrm enumerate winrm/config/listener`).

### Windows installer hangs at product key
**Symptom:** Build stalls at the "Enter product key" screen.
**Fix:** Ensure `<ProductKey><Key></Key></ProductKey>` is present in autounattend.xml (empty key skips the prompt), or provide a valid volume license key.

### Parallels Tools installation fails
**Symptom:** PTAgent.exe not found or installation errors.
**Fix:** Verify `parallels_tools_flavor = "win"` in the source block. The tools ISO should be auto-mounted by Packer.

## Sysprep Failures

### Sysprep fails with error 0x80073cf2
**Symptom:** Sysprep cannot generalize due to provisioned apps.
**Fix:** Remove problematic UWP apps before sysprep:
```powershell
Get-AppxPackage | Where-Object { $_.NonRemovable -eq $false } | Remove-AppxPackage -ErrorAction SilentlyContinue
```

### Image boots to desktop instead of OOBE
**Symptom:** After cloning, the VM skips OOBE entirely.
**Cause:** Sysprep `/oobe` flag was not used, or an unattend.xml in `C:\Windows\System32\Sysprep\` is completing OOBE automatically.
**Fix:** Rebuild with proper sysprep flags. Check for leftover unattend.xml files.

## Autopilot / Enrollment Issues

### OOBE skips Autopilot and shows local account setup
**Symptom:** User sees "Who's going to use this device?" instead of Entra sign-in.
**Cause:** VM has no network during OOBE, or Entra MDM auto-enrollment is not configured.
**Fix:**
1. Ensure VM is connected to the network during OOBE
2. Verify Entra ID → Mobility (MDM and MAM) → Microsoft Intune is configured for "All" or the target group
3. If using Autopilot pre-registration, verify the hardware hash was imported successfully

### Entra Join succeeds but Intune enrollment fails
**Symptom:** Device appears in Entra ID but not in Intune.
**Cause:** MDM auto-enrollment scope doesn't include the user.
**Fix:** In Entra ID → Mobility → Microsoft Intune, ensure MDM user scope includes the user (or is set to "All").

### ESP (Enrollment Status Page) times out
**Symptom:** "Setup could not be completed" after 60 minutes.
**Causes:**
- Large apps assigned to the device taking too long to install
- Network connectivity issues during app deployment
- App installation stuck
**Fix:** Check Intune portal → Devices → the device → App install status. Consider reducing the number of required apps.

## BitLocker Issues

### BitLocker policy fails on VM
**Symptom:** Intune compliance shows BitLocker not enabled.
**Cause:** vTPM not enabled on the VM.
**Fix:** Ensure `["set", "{{.Name}}", "--tpm-enabled", "on"]` is in the Packer template's `prlctl` block. Verify with `Get-Tpm` inside the VM.

### BitLocker recovery key not escrowed
**Symptom:** BitLocker encrypts but recovery key not in Entra/Intune.
**Fix:** This is handled by Intune policy after enrollment. Verify the BitLocker policy has "Store recovery information in Azure Active Directory" enabled.

## Parallels-Specific Issues

### Clone has same identity as golden image
**Symptom:** Two devices appear with the same identity in Entra.
**Cause:** Image was not sysprep'd, or was cloned from a post-enrollment state.
**Never** clone or snapshot a VM after Entra Join / Intune enrollment.
**Fix:** Always clone from the sysprep'd golden image, before any enrollment.

### Parallels Tools broken after clone
**Symptom:** Resolution scaling, shared folders, etc. don't work after cloning.
**Cause:** Sysprep generalization can sometimes reset device driver state.
**Fix:** Add a RunOnce registry entry to repair Parallels Tools:
```powershell
# Add to configure-registry.ps1 before sysprep
$repairCmd = '"C:\Program Files\Parallels\Parallels Tools\PTAgent.exe" /repair_silent'
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce" -Name "RepairPrlTools" -Value $repairCmd
```

## VM Lifecycle / Decommissioning

### Stale device records in Entra/Intune
**Symptom:** Old VMs still show as managed devices.
**Fix:** When decommissioning a VM:
1. In Intune: Devices → Select device → Retire (removes management) or Wipe
2. In Entra ID: Devices → Select device → Delete
3. If Autopilot registered: Delete from Autopilot devices too
4. Then delete the VM in Parallels
