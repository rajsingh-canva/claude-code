#!/usr/bin/env bash
# Custom template: N panes, one per prompt argument
# Usage: launch_template <prompt1> [prompt2] [prompt3] ...

launch_template() {
  if [[ $# -eq 0 ]]; then
    echo "Usage: cca launch custom <prompt1> [prompt2] [prompt3] ..." >&2
    exit 1
  fi

  local SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bin" && pwd)"
  source "$SCRIPT_DIR/../lib/tmux-helpers.sh"
  ensure_tmux

  local SESSION
  SESSION=$(create_session "custom")

  local prompts=("$@")
  local count=${#prompts[@]}

  # Create additional panes (first pane already exists)
  for ((i=1; i<count; i++)); do
    if ((i % 2 == 1)); then
      tmux split-window -h -t "$SESSION:0"
    else
      tmux split-window -v -t "$SESSION:0"
    fi
  done
  tmux select-layout -t "$SESSION:0" tiled

  # Spawn agents
  for ((i=0; i<count; i++)); do
    "$SCRIPT_DIR/cca-spawn" --session "$SESSION" --pane "0.$i" --name "agent-$((i+1))" \
      --prompt "${prompts[$i]}" --model sonnet
  done

  # Dashboard
  "$SCRIPT_DIR/cca-dash" "$SESSION"
  tmux select-window -t "$SESSION:0"

  echo "Custom session: $SESSION ($count agents)"
  echo "Attach with: tmux attach -t $SESSION"
  tmux attach -t "$SESSION"
}
