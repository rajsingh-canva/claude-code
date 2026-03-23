#!/bin/bash
# Orchestrate a golden image rebuild using Packer
#
# Usage:
#   ./update-golden-image.sh
#   ./update-golden-image.sh --skip-archive
#   ./update-golden-image.sh --packer-dir /path/to/packer/files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKER_DIR="${PACKER_DIR:-$(dirname "$SCRIPT_DIR")/assets/packer}"
ARCHIVE_DIR="${ARCHIVE_DIR:-$HOME/golden-images/archive}"
OUTPUT_DIR="output-windows11"
SKIP_ARCHIVE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-archive) SKIP_ARCHIVE=true; shift ;;
        --packer-dir) PACKER_DIR="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "=== Golden Image Rebuild ==="
echo "Packer directory: $PACKER_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Validate Packer is installed
if ! command -v packer &>/dev/null; then
    echo "ERROR: Packer is not installed. Run: brew install packer"
    exit 1
fi

# Validate Parallels CLI
if ! command -v prlctl &>/dev/null; then
    echo "ERROR: Parallels CLI (prlctl) not found. Is Parallels Desktop installed?"
    exit 1
fi

cd "$PACKER_DIR"

# Initialize Packer plugins
echo "Initializing Packer plugins..."
packer init windows11.pkr.hcl

# Validate the template
echo "Validating Packer template..."
packer validate -var-file=variables.pkrvars.hcl windows11.pkr.hcl

# Archive existing output if present
if [ -d "$OUTPUT_DIR" ] && [ "$SKIP_ARCHIVE" = false ]; then
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    mkdir -p "$ARCHIVE_DIR"
    echo "Archiving existing image to $ARCHIVE_DIR/golden-win11-$TIMESTAMP.pvm..."
    mv "$OUTPUT_DIR"/*.pvm "$ARCHIVE_DIR/golden-win11-$TIMESTAMP.pvm" 2>/dev/null || true
    rm -rf "$OUTPUT_DIR"
fi

# Build the image
echo ""
echo "Starting Packer build..."
echo "This will take 30-60 minutes depending on your system."
echo ""

packer build -var-file=variables.pkrvars.hcl windows11.pkr.hcl

# Verify output
if [ -d "$OUTPUT_DIR" ]; then
    PVM_FILE=$(find "$OUTPUT_DIR" -name "*.pvm" -type d | head -1)
    if [ -n "$PVM_FILE" ]; then
        PVM_SIZE=$(du -sh "$PVM_FILE" | cut -f1)
        echo ""
        echo "=== Build Complete ==="
        echo "Image: $PVM_FILE"
        echo "Size:  $PVM_SIZE"
        echo ""
        echo "Next steps:"
        echo "  1. Upload to Parallels Management Portal as a golden image"
        echo "  2. Assign to a policy targeting your user group"
        echo "  3. Users will get the VM via Parallels and complete Autopilot enrollment"
    else
        echo "ERROR: Build completed but no .pvm file found in $OUTPUT_DIR"
        exit 1
    fi
else
    echo "ERROR: Build failed — output directory not created"
    exit 1
fi
