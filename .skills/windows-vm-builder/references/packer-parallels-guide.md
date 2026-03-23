# Packer + Parallels Builder Reference

## Plugin Installation

```bash
# Install Packer
brew install packer

# The plugin is auto-installed via the required_plugins block in the template
packer init windows11.pkr.hcl

# Or install manually
packer plugins install github.com/Parallels/parallels
```

## Builder Types

The Parallels plugin provides two builders:

| Builder | Use Case |
|---------|----------|
| `parallels-iso` | Build from an ISO (what we use for golden images) |
| `parallels-pvm` | Build from an existing .pvm (for incremental updates) |

## Source Block Configuration

```hcl
source "parallels-iso" "windows11" {
  guest_os_type          = "win-11"
  parallels_tools_flavor = "win"

  iso_url      = var.iso_url
  iso_checksum = var.iso_checksum

  disk_size = 65536   # MB
  disk_type = "expand" # Thin provisioned

  vm_name          = "golden-win11"
  output_directory = "output-windows11"

  # Hardware via prlctl
  prlctl = [
    ["set", "{{.Name}}", "--memsize", "8192"],
    ["set", "{{.Name}}", "--cpus", "4"],
    ["set", "{{.Name}}", "--efi-boot", "on"],
    ["set", "{{.Name}}", "--chip-type", "apple"],
    ["set", "{{.Name}}", "--tpm-enabled", "on"],
  ]

  # Attach answer file
  floppy_files = ["assets/autounattend/autounattend.xml"]

  # WinRM communicator
  communicator   = "winrm"
  winrm_username = "packer"
  winrm_password = "packer"
  winrm_timeout  = "60m"

  boot_wait        = "5s"
  shutdown_command  = "shutdown /s /t 10 /f /d p:4:1"
  shutdown_timeout  = "15m"
}
```

## ARM64 / Apple Silicon

This skill targets Apple Silicon Macs exclusively. All templates use ARM64 architecture.

- `--chip-type apple` is set in the Packer template
- A Windows 11 ARM64 ISO is required (download from VLSC or Microsoft evaluation center)
- vTPM works via Parallels' ARM64 implementation
- `--efi-boot on` is mandatory for Windows 11 on ARM

## prlctl Hardware Options

| Setting | Flag | Notes |
|---------|------|-------|
| Memory | `--memsize <MB>` | Minimum 4096 for Win11 |
| CPUs | `--cpus <N>` | Minimum 2 for Win11 |
| EFI Boot | `--efi-boot on` | Required for Win11 |
| Chip Type | `--chip-type apple` | For Apple Silicon |
| vTPM | `--tpm-enabled on` | Required for BitLocker |
| Nested Virt | `--nested-virt on` | For WSL2 / Hyper-V |
| Network | `--device-set net0 --type shared` | Default, NAT |

## WinRM Communicator

The WinRM communicator is used by Packer to run provisioner scripts inside the VM. Configuration:

1. **autounattend.xml** creates the `packer` user and enables WinRM on first boot
2. Packer waits for WinRM to become available (up to `winrm_timeout`)
3. Provisioners run PowerShell scripts over WinRM
4. The sysprep script disables WinRM before generalization

Troubleshooting WinRM:
- Ensure firewall rule allows port 5985
- `winrm_use_ssl = false` and basic auth must match autounattend.xml settings
- If WinRM times out, check that autounattend.xml auto-logon is working

## Boot Command

For ISO builds, Packer can send keystrokes during boot. However, with autounattend.xml on the floppy, this is usually unnecessary — Windows reads the answer file automatically.

If the installer doesn't detect the answer file:
```hcl
boot_command = [
  "<wait5><enter>",  # Press any key to boot from CD
]
```
