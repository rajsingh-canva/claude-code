#!/usr/bin/env bash
# Code review template: 2 panes (code reviewer + security reviewer)
# Usage: launch_template <task-description> [project-dir]

launch_template() {
  local TASK="${1:?Usage: cca launch code-review <task> [project-dir]}"
  local PROJECT="${2:-$(pwd)}"
  local SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bin" && pwd)"

  source "$SCRIPT_DIR/../lib/tmux-helpers.sh"
  ensure_tmux

  local SESSION
  SESSION=$(create_session "review")

  # Split into 2 panes side by side
  tmux split-window -h -t "$SESSION:0"

  # Spawn agents
  "$SCRIPT_DIR/cca-spawn" --session "$SESSION" --pane "0.0" --name code-reviewer \
    --prompt "Review this code for correctness, maintainability, and best practices: $TASK" \
    --project "$PROJECT" --model sonnet

  "$SCRIPT_DIR/cca-spawn" --session "$SESSION" --pane "0.1" --name security-reviewer \
    --prompt "Security review this code. Look for vulnerabilities, injection risks, auth issues, secrets exposure: $TASK" \
    --project "$PROJECT" --model sonnet

  # Launch dashboard as second window
  "$SCRIPT_DIR/cca-dash" "$SESSION"

  # Focus on the agent panes
  tmux select-window -t "$SESSION:0"

  echo "Code review session: $SESSION"
  echo "Attach with: tmux attach -t $SESSION"
  tmux attach -t "$SESSION"
}
