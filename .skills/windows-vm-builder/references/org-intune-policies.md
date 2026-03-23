# Organization Intune Policy Reference

> This file is organization-specific and can be swapped out per-org.
> It summarizes the Intune policies that will be applied to VMs after enrollment.
> Knowing these helps avoid conflicts between Packer-baked settings and Intune-managed policies.

## Autopilot Deployment Profile

| Setting | Value |
|---------|-------|
| Profile Name | Win11 Autopilot HP |
| Deployment Mode | User-Driven |
| Join to Entra ID as | Microsoft Entra Joined |
| Language | Operating System Default |
| User Account Type | Administrator |
| Pre-Provisioned Deployment | No |

## Enrollment Status Pages

| Policy | Target |
|--------|--------|
| Win11-Status-Enrollment-HP | Autopilot-enrolled devices |
| Win11-Manual-Enrollment | Manually enrolled devices + VMs |

Both policies: 60-minute timeout, block device use until all apps installed, allow user reset on error.

## BitLocker (Intune-Managed — DO NOT bake into image)

- Require device encryption: Enabled
- OS drive encryption: XTS-AES 256-bit, full disk
- Requires TPM (no PIN/key alternatives)
- Recovery password rotation for Entra-joined devices
- **VM requirement:** vTPM must be enabled in Parallels settings

## WSL Restriction (Intune-Managed)

All WSL settings disabled — WSL completely blocked. This is managed by Intune, do not configure in the golden image.

## Passcode Policy (Intune-Managed)

- Windows Hello authentication enforced (passcode, fingerprint, or facial recognition)
- SSO via Entra (backed by Okta) — Okta password is the device password

## Windows Update Ring (Intune-Managed)

- Policy: Windows Update Ring
- Automatic updates with enforced deadlines for feature and quality updates
- Do NOT configure Windows Update settings in the golden image

## Firewall (Intune-Managed)

Managed by Intune post-enrollment. Do not pre-configure firewall rules in the golden image (the WinRM rule added during build is removed before sysprep).

## SOC2 Compliance Touchpoints

- OS patching validated via Update Ring device check-in status
- Disk encryption validated via BitLocker device check-in status
- Passcode policy validated via passcode policy device check-in status
- App management: Win32 apps packaged manually, deployed via Intune

## What to Bake Into the Image vs What Intune Manages

| Category | Golden Image | Intune |
|----------|-------------|--------|
| Telemetry/privacy | Yes (registry) | No |
| BitLocker | No | Yes |
| WSL | No | Yes |
| Passcode/Hello | No | Yes |
| Windows Update | No | Yes |
| Firewall | No | Yes |
| Enterprise apps (optional) | Pre-install only | Managed install |
| Parallels Tools | Yes | No |
| Registry hardening (non-conflicting) | Yes | No |
