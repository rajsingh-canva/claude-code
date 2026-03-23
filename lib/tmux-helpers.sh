#!/usr/bin/env bash
# Shared tmux manipulation functions

ensure_tmux() {
  if ! command -v tmux &>/dev/null; then
    echo "ERROR: tmux not installed. Run: brew install tmux" >&2
    exit 1
  fi
}

# Return the most recent cca-managed tmux session
get_active_session() {
  tmux list-sessions -F '#{session_name}' 2>/dev/null \
    | grep -E '^(research|review|feature|orch|custom)-' \
    | tail -1
}

# List all cca-managed sessions
list_sessions() {
  local sessions
  sessions=$(tmux list-sessions -F '#{session_name}  #{session_created_string}  #{session_windows} windows' 2>/dev/null \
    | grep -E '^(research|review|feature|orch|custom)-')
  if [[ -z "$sessions" ]]; then
    echo "No active agent sessions"
  else
    echo "$sessions"
  fi
}

# Check if a pane's process has finished (shell is idle)
pane_is_idle() {
  local session="$1" pane="$2"
  local cmd
  cmd=$(tmux display-message -t "$session:$pane" -p '#{pane_current_command}' 2>/dev/null)
  [[ "$cmd" == "bash" || "$cmd" == "zsh" ]]
}

# Create a new cca session with a given prefix and return its name
create_session() {
  local prefix="${1:-custom}"
  local session="${prefix}-$(date +%s)"
  tmux new-session -d -s "$session" -x 220 -y 60
  echo "$session"
}
