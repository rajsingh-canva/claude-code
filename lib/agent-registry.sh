#!/usr/bin/env bash
# Track running agents per session
# Registry format: NAME|PANE|START_TIME|STATUS

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$SCRIPT_DIR/../state"

register_agent() {
  local session="$1" name="$2" pane="$3"
  local registry="$STATE_DIR/$session.registry"
  mkdir -p "$STATE_DIR"
  echo "$name|$pane|$(date +%s)|running" >> "$registry"
}

list_agents() {
  local session="$1"
  local registry="$STATE_DIR/$session.registry"
  [[ -f "$registry" ]] && cut -d'|' -f1 "$registry"
}

update_agent_status() {
  local session="$1" name="$2" status="$3"
  local registry="$STATE_DIR/$session.registry"
  [[ -f "$registry" ]] || return 1
  sed -i '' "s/^${name}|\([^|]*\)|\([^|]*\)|.*$/${name}|\1|\2|${status}/" "$registry"
}

# Print a status table for all agents in a session
agent_status_table() {
  local session="$1"
  local registry="$STATE_DIR/$session.registry"
  local log_dir="$SCRIPT_DIR/../logs/$session"

  printf "%-20s %-8s %-10s %-15s\n" "AGENT" "PANE" "STATUS" "LAST OUTPUT"
  printf "%-20s %-8s %-10s %-15s\n" "-----" "----" "------" "-----------"

  [[ -f "$registry" ]] || return 0

  while IFS='|' read -r name pane start status; do
    # Check if pane process is still active
    if tmux display-message -t "$session:$pane" -p '#{pane_current_command}' 2>/dev/null | grep -qv '^[a-z]*sh$'; then
      status="running"
    elif [[ "$status" == "running" ]]; then
      status="done"
    fi

    # Check last log modification
    local log_file="$log_dir/agent-${name}.log"
    local last_output="--"
    if [[ -f "$log_file" ]]; then
      local mod_time
      mod_time=$(stat -f %m "$log_file" 2>/dev/null || echo 0)
      local now
      now=$(date +%s)
      local diff=$((now - mod_time))
      if [[ $diff -lt 60 ]]; then
        last_output="${diff}s ago"
      elif [[ $diff -lt 3600 ]]; then
        last_output="$((diff / 60))m ago"
      else
        last_output="$((diff / 3600))h ago"
      fi
    fi

    printf "%-20s %-8s %-10s %-15s\n" "$name" "$pane" "$status" "$last_output"
  done < "$registry"
}
