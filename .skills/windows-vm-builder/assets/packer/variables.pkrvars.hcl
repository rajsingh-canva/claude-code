# Windows 11 Enterprise ISO
# Download from Microsoft Volume Licensing Service Center (VLSC)
# or use evaluation ISO from https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise
iso_url      = "/path/to/Windows11_Enterprise.iso"
iso_checksum = "sha256:REPLACE_WITH_ACTUAL_CHECKSUM"

# VM Resources
disk_size = 65536  # 64 GB
memory    = 8192   # 8 GB
cpus      = 4

# Output
output_directory = "output-windows11"
vm_name          = "golden-win11"

# WinRM credentials (must match autounattend.xml)
winrm_username = "packer"
winrm_password = "packer"
