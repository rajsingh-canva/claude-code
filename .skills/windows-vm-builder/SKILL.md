---
name: windows-vm-builder
description: Build automated Windows 11 VM golden images on macOS using Packer with the Parallels builder, configured for User-Driven Autopilot enrollment via Entra ID. Use when creating Packer templates for Windows VMs, configuring sysprep for Autopilot OOBE, registering VM hardware hashes, distributing golden images via Parallels Management Portal, or troubleshooting Autopilot/Intune enrollment for VMs.
---

# Windows VM Builder

Build sysprep'd Windows 11 golden images on macOS using HashiCorp Packer + Parallels Desktop Enterprise. Each VM enrolls via **User-Driven Autopilot** at first boot, tying the device to a specific user in Entra ID (backed by Okta).

**Do NOT use Parallels Declarative Deployment or .ppkg bulk enrollment tokens.** Bulk enrollment creates device-only Entra records with no user affinity. This skill uses Entra Join with MDM auto-enrollment to ensure per-user device binding.

## Architecture

```
Packer Build (one-time)          Distribution              User Enrollment
┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐
│ Windows ISO          │    │ Parallels Mgmt   │    │ VM boots → OOBE         │
│ + autounattend.xml   │───>│ Portal           │───>│ → Network connect       │
│ + provisioners       │    │ (Golden Image)   │    │ → Entra sign-in         │
│ + sysprep /oobe      │    │                  │    │ → Intune auto-enroll    │
│ = .pvm golden image  │    │ Policy → Users   │    │ → Apps + policies push  │
└─────────────────────┘    └──────────────────┘    └─────────────────────────┘
```

## Prerequisites

```bash
# Install Packer
brew install packer

# Verify Parallels Desktop Enterprise is installed
prlctl --version

# Initialize the Parallels plugin (auto-installed from template)
cd assets/packer && packer init windows11.pkr.hcl

# For Graph API registration (optional)
/opt/homebrew/bin/python3.12 -m pip install msal requests
```

Requirements:
- macOS with Parallels Desktop Enterprise Edition
- Windows 11 Enterprise ARM64 ISO (required for Apple Silicon)
- Entra ID tenant with MDM auto-enrollment configured (Intune)
- Graph API app registration (only if using pre-registration strategy)

## Build Workflow

### Step 1: Configure Variables

Edit `assets/packer/variables.pkrvars.hcl`:
- Set `iso_url` to your Windows 11 ISO path
- Set `iso_checksum` to the SHA256 hash
- Adjust `memory`, `cpus`, `disk_size` as needed

### Step 2: Customize Provisioners

Edit the scripts in `assets/packer/scripts/`:
- `install-enterprise-apps.ps1` — Add org-specific apps to pre-install
- `configure-registry.ps1` — Add non-Intune-managed hardening settings
- Leave `install-parallels-tools.ps1` and `run-sysprep.ps1` as-is

**Important:** Do not pre-configure settings that Intune manages (BitLocker, WSL, passcode, firewall, Windows Update). See `references/org-intune-policies.md` for the boundary.

### Step 3: Build the Image

```bash
cd assets/packer
packer init windows11.pkr.hcl
packer validate -var-file=variables.pkrvars.hcl windows11.pkr.hcl
packer build -var-file=variables.pkrvars.hcl windows11.pkr.hcl
```

Build takes 30-60 minutes. Packer will:
1. Create a Parallels VM and boot the Windows ISO
2. Apply `autounattend.xml` for unattended installation
3. Wait for WinRM, then run provisioner scripts in sequence
4. Sysprep generalizes the image and shuts down the VM
5. Output: `output-windows11/*.pvm`

Or use the helper script: `scripts/update-golden-image.sh`

### Step 4: Distribute via Parallels Management Portal

1. Log into Parallels Management Portal
2. Go to Golden Images → Create new image
3. Select **Standard** (NOT Declarative) deployment
4. Upload the `.pvm` file
5. Create a policy, assign to target user group
6. Users install Parallels → activate via SSO → download the Corporate VM

### Step 5: User Enrollment (automatic)

When a user boots the VM for the first time:
1. Windows OOBE starts (sysprep triggers this)
2. User connects to network
3. Entra ID sign-in page appears
4. User signs in with their corporate credentials
5. Device registers to that specific user in Entra ID
6. Intune auto-enrollment triggers
7. ESP shows while policies and apps deploy
8. Desktop ready — device is fully managed and tied to the user

## Enrollment Strategy

**Primary: User-Driven OOBE (recommended)**
- No pre-registration needed
- User signs in at OOBE → Entra Join → Intune auto-enrollment
- Device is tied to the signing-in user
- Works with existing manual enrollment ESP policies

**Alternative: Graph API pre-registration**
- For zero-touch scenarios where you need Autopilot profile assignment
- Requires extracting hardware hash per-clone and registering via Graph API
- See `references/graph-api-autopilot.md` and `scripts/register-autopilot.py`
- More complex, generally not needed for the User-Driven approach

## Image Maintenance

Rebuild monthly to include latest Windows updates:

```bash
./scripts/update-golden-image.sh
```

Versioning convention: `YYYY-MM-golden-win11-v{N}.pvm`

After rebuilding, upload the new image to the Management Portal and update the policy.

## VM Decommissioning

When a VM is no longer needed:
1. Intune → Devices → Select device → Retire or Wipe
2. Entra ID → Devices → Delete the device record
3. Delete the VM in Parallels

Never clone or snapshot a VM after enrollment — always clone from the sysprep'd golden image.

## Reference Documents

| Document | When to load |
|----------|-------------|
| `references/packer-parallels-guide.md` | Packer template configuration, prlctl options, Apple Silicon notes |
| `references/sysprep-autopilot.md` | Sysprep flags, OOBE settings, what breaks Autopilot |
| `references/graph-api-autopilot.md` | Pre-registration via Graph API (alternative strategy) |
| `references/org-intune-policies.md` | Org-specific Intune policies, what to bake vs what Intune manages |
| `references/troubleshooting.md` | WinRM timeouts, sysprep failures, enrollment issues, BitLocker |

## Known Limitations

- **Parallels Tools after clone:** May need repair on first boot. A RunOnce registry entry handles this automatically (see `configure-registry.ps1`).
- **ARM64 only:** This skill targets Apple Silicon Macs. An ARM64 Windows 11 ISO is required.
- **vTPM:** Must be explicitly enabled via `prlctl` for BitLocker compliance.
- **Stale device records:** VM decommissioning requires manual Entra/Intune cleanup. No automated lifecycle management yet.
- **Sysprep limit:** Windows has a sysprep count limit (1001 reseals). Not an issue for golden image building but relevant if re-syspreping clones.
