# Sysprep + Autopilot Compatibility Reference

## Sysprep Command

```powershell
sysprep.exe /generalize /oobe /shutdown /quiet
```

| Flag | Purpose |
|------|---------|
| `/generalize` | Removes machine-specific data (SID, hardware drivers, etc.) |
| `/oobe` | Triggers Out-of-Box Experience on next boot |
| `/shutdown` | Shuts down after sysprep (Packer captures the image) |
| `/quiet` | Suppresses the sysprep UI |

## What Sysprep Generalizes

- Security Identifier (SID) — regenerated on next boot
- Machine name — reset to random
- User profiles — local accounts removed
- Hardware-specific drivers — re-detected on next boot
- Network configuration — reset

## What Survives Sysprep

- Installed applications (including Parallels Tools)
- Registry settings in HKLM (your hardening settings persist)
- Files on disk
- Windows features and roles

## Critical: OOBE Settings for Autopilot

Autopilot User-Driven enrollment requires specific OOBE screens to remain visible. Do NOT skip these in autounattend.xml:

| Screen | Must Keep? | Why |
|--------|-----------|-----|
| Network/WiFi selection | YES | Autopilot needs network to contact the enrollment service |
| Sign-in page | YES | User signs in with Entra credentials here |
| EULA | Can skip | Not needed for enrollment |
| Privacy settings | Can skip | Managed by Intune |
| Keyboard layout | Can skip | Inherited from image or configured by Intune |

## Autopilot Detection Flow (Post-Sysprep)

1. VM boots → OOBE starts
2. User connects to network
3. Windows contacts the Autopilot service with the device's hardware hash
4. **If device IS registered with Autopilot**: Full Autopilot profile applies (branding, ESP, app install)
5. **If device is NOT registered**: Standard OOBE continues, user can still do manual Entra Join
6. User signs in with Entra credentials → device registered to that user
7. Intune enrollment triggers → policies and apps deploy

## Strategy: User-Driven Without Pre-Registration

For the recommended approach (no pre-registration), the flow is:

1. Packer builds and syspreps the image
2. Image distributed via Parallels Management Portal
3. User boots the VM, connects to network
4. OOBE presents the Entra sign-in page
5. User authenticates → Entra Join completes
6. Intune auto-enrollment triggers (via Entra Join MDM enrollment settings)
7. ESP shows progress while Intune policies and apps install

This works because:
- Entra ID MDM auto-enrollment is configured at the tenant level
- Any Entra-joined device automatically enrolls in Intune
- No Autopilot pre-registration needed for manual Entra Join

## Parallels Virtual Hardware and Sysprep

- **Virtual MAC address**: Unique per clone (Parallels assigns new MAC on clone)
- **Virtual disk ID**: Unique per clone
- **vTPM**: Persists through sysprep, unique per VM instance
- **Hardware hash**: Generated from virtual hardware — unique per clone due to unique MAC/disk

This means each clone from the golden image will have a unique identity, which is exactly what we want for per-user enrollment.

## Things That Will Break Autopilot

- Skipping the network setup page in OOBE unattend
- Pre-joining a domain in the image (conflicts with Entra Join)
- Leaving a user profile in the image (sysprep should remove it)
- Disabling the Autopilot-related scheduled tasks
- Blocking outbound HTTPS to enrollment endpoints
