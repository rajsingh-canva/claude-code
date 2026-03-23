#!/usr/bin/env bash
# Research template: 3 panes (researcher + analyst + synthesizer)
# Usage: launch_template <topic> [project-dir]

launch_template() {
  local TOPIC="${1:?Usage: cca launch research <topic> [project-dir]}"
  local PROJECT="${2:-$(pwd)}"
  local SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../bin" && pwd)"

  source "$SCRIPT_DIR/../lib/tmux-helpers.sh"
  ensure_tmux

  local SESSION
  SESSION=$(create_session "research")

  # Create 3-pane layout
  #   ┌──────────┬──────────┐
  #   │ Research  │ Analyst  │
  #   ├──────────┴──────────┤
  #   │    Synthesizer       │
  #   └─────────────────────┘
  tmux split-window -h -t "$SESSION:0"
  tmux split-window -v -t "$SESSION:0.0" -p 30

  # Researcher: broad exploration
  "$SCRIPT_DIR/cca-spawn" --session "$SESSION" --pane "0.0" --name researcher \
    --prompt "Research the following topic thoroughly. Gather facts, evidence, and different perspectives: $TOPIC" \
    --project "$PROJECT" --model sonnet

  # Analyst: critical analysis
  "$SCRIPT_DIR/cca-spawn" --session "$SESSION" --pane "0.1" --name analyst \
    --prompt "Analyze gaps, assumptions, and counter-arguments for this topic. Ask probing questions and identify what's missing: $TOPIC" \
    --project "$PROJECT" --model sonnet

  # Synthesizer: waits then combines (reads log files)
  local LOG_DIR="$SCRIPT_DIR/../logs/$SESSION"
  "$SCRIPT_DIR/cca-spawn" --session "$SESSION" --pane "0.2" --name synthesizer \
    --prompt "Wait 30 seconds, then read the files at $LOG_DIR/agent-researcher.log and $LOG_DIR/agent-analyst.log. Synthesize the researcher's findings and the analyst's questions into a structured report with: Summary, Key Findings, Open Questions, Recommendations." \
    --project "$PROJECT" --model opus

  # Launch dashboard
  "$SCRIPT_DIR/cca-dash" "$SESSION"
  tmux select-window -t "$SESSION:0"

  echo "Research session: $SESSION"
  echo "Attach with: tmux attach -t $SESSION"
  tmux attach -t "$SESSION"
}
