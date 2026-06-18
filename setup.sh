#!/usr/bin/env bash
# Setup script for claude-code toolkit
# Run this after cloning the repo on a new machine

set -euo pipefail

echo "=== Claude Code Toolkit Setup ==="

# Check prerequisites
echo "Checking prerequisites..."
for cmd in tmux jq claude; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  Missing: $cmd"
    case "$cmd" in
      tmux) echo "  Install: brew install tmux" ;;
      jq)   echo "  Install: brew install jq" ;;
      claude) echo "  Install: https://docs.anthropic.com/en/docs/claude-code" ;;
    esac
  else
    echo "  Found: $cmd ($(command -v "$cmd"))"
  fi
done

if ! command -v uv &>/dev/null; then
  echo "  Missing: uv"
  echo "  Install: brew install uv  OR  curl -LsSf https://astral.sh/uv/install.sh | sh"
else
  echo "  Found: uv ($(command -v uv))"
fi

# Determine shell profile
SHELL_PROFILE=""
if [[ -f "$HOME/.zshrc" ]]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
  SHELL_PROFILE="$HOME/.bashrc"
elif [[ -f "$HOME/.bash_profile" ]]; then
  SHELL_PROFILE="$HOME/.bash_profile"
fi

# Add to PATH
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"

if [[ -n "$SHELL_PROFILE" ]]; then
  if ! grep -q 'claude-code/bin' "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# Claude Code toolkit" >> "$SHELL_PROFILE"
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_PROFILE"
    echo "export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" >> "$SHELL_PROFILE"
    echo "Added PATH and CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to $SHELL_PROFILE"
  else
    echo "PATH already configured in $SHELL_PROFILE"
  fi
else
  echo "No shell profile found. Manually add to your profile:"
  echo "  export PATH=\"\$HOME/Work/claude-code/bin:\$PATH\""
  echo "  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"
fi

# Install Python SDK orchestrator dependencies
if command -v uv &>/dev/null && [[ -d "$SCRIPT_DIR/orchestrator" ]]; then
  echo "Installing Python SDK orchestrator dependencies..."
  cd "$SCRIPT_DIR/orchestrator" && uv sync
  echo "  Done."
fi

# Set up notebooklm-py
NOTEBOOKLM_DIR="$HOME/work/notebooklm-py"
if [[ ! -d "$NOTEBOOKLM_DIR" ]]; then
  echo "Setting up notebooklm-py..."
  if ! command -v git &>/dev/null; then
    echo "  Missing: git — skipping notebooklm-py setup"
  else
    NOTEBOOKLM_TAG=$(curl -s https://api.github.com/repos/teng-lin/notebooklm-py/releases/latest | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
    echo "  Using release $NOTEBOOKLM_TAG"
    git clone --branch "$NOTEBOOKLM_TAG" --depth 1 https://github.com/teng-lin/notebooklm-py.git "$NOTEBOOKLM_DIR"
    cd "$NOTEBOOKLM_DIR"
    uv venv
    source .venv/bin/activate
    uv pip install -e ".[browser]"
    playwright install chromium
    deactivate
    cd "$SCRIPT_DIR"
    echo "  Done."
    echo "  Authenticate once after setup:"
    echo "    source ~/work/notebooklm-py/.venv/bin/activate && notebooklm auth"
  fi
else
  echo "  Found: notebooklm-py ($NOTEBOOKLM_DIR)"
fi

# Create logs and state directories
mkdir -p "$SCRIPT_DIR/logs" "$SCRIPT_DIR/state"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Reload your shell:  source $SHELL_PROFILE"
echo ""
echo "Quick start:"
echo "  claude --teammate-mode tmux              # Native agent teams"
echo "  cca launch code-review 'Review HEAD~1'   # Shell template"
echo "  cca dash                                 # Monitoring dashboard"
echo "  cd orchestrator && uv run main.py 'task' ~/Work/project  # SDK orchestrator"
