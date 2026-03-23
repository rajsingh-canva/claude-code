packer {
  required_plugins {
    parallels = {
      version = ">= 1.1.0"
      source  = "github.com/Parallels/parallels"
    }
  }
}

variable "iso_url" {
  type        = string
  description = "Path or URL to the Windows 11 ISO"
}

variable "iso_checksum" {
  type        = string
  description = "SHA256 checksum of the ISO"
}

variable "disk_size" {
  type    = number
  default = 65536
}

variable "memory" {
  type    = number
  default = 8192
}

variable "cpus" {
  type    = number
  default = 4
}

variable "output_directory" {
  type    = string
  default = "output-windows11"
}

variable "vm_name" {
  type    = string
  default = "golden-win11"
}

variable "winrm_username" {
  type    = string
  default = "packer"
}

variable "winrm_password" {
  type      = string
  default   = "packer"
  sensitive = true
}

source "parallels-iso" "windows11" {
  guest_os_type          = "win-11"
  parallels_tools_flavor = "win"

  iso_url      = var.iso_url
  iso_checksum = var.iso_checksum

  disk_size = var.disk_size
  disk_type = "expand"

  vm_name          = var.vm_name
  output_directory = var.output_directory

  # Hardware configuration
  prlctl = [
    ["set", "{{.Name}}", "--memsize", "${var.memory}"],
    ["set", "{{.Name}}", "--cpus", "${var.cpus}"],
    ["set", "{{.Name}}", "--efi-boot", "on"],
    ["set", "{{.Name}}", "--chip-type", "apple"],
    # Enable virtual TPM for BitLocker compatibility
    ["set", "{{.Name}}", "--tpm-enabled", "on"],
  ]

  # Attach autounattend.xml via floppy
  floppy_files = [
    "assets/autounattend/autounattend.xml",
  ]

  # WinRM communicator for provisioning
  communicator   = "winrm"
  winrm_username = var.winrm_username
  winrm_password = var.winrm_password
  winrm_timeout  = "60m"
  winrm_use_ssl  = false

  # Allow time for Windows install + first boot
  boot_wait = "5s"

  shutdown_command = "shutdown /s /t 10 /f /d p:4:1 /c \"Packer shutdown\""
  shutdown_timeout = "15m"
}

build {
  sources = ["source.parallels-iso.windows11"]

  # Step 1: Install Parallels Tools
  provisioner "powershell" {
    script = "assets/packer/scripts/install-parallels-tools.ps1"
  }

  # Step 2: Install enterprise applications
  provisioner "powershell" {
    script = "assets/packer/scripts/install-enterprise-apps.ps1"
  }

  # Step 3: Apply registry hardening (non-conflicting with Intune)
  provisioner "powershell" {
    script = "assets/packer/scripts/configure-registry.ps1"
  }

  # Step 4: Run sysprep to generalize the image for Autopilot
  # This MUST be the last provisioner — sysprep shuts down the VM
  provisioner "powershell" {
    script = "assets/packer/scripts/run-sysprep.ps1"
  }
}
