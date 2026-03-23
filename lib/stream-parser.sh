#!/usr/bin/env bash
# jq filters for parsing claude --output-format stream-json output

# Extract only assistant text content from stream-json
extract_text() {
  jq -r --unbuffered '
    select(.type == "assistant")
    | .content[]?
    | select(.type == "text")
    | .text // empty
  '
}

# Extract tool usage events
extract_tool_calls() {
  jq -r --unbuffered '
    select(.type == "assistant")
    | .content[]?
    | select(.type == "tool_use")
    | "\(.name): \(.input | tostring | .[0:100])"
  '
}

# Extract cost/token info from result messages
extract_stats() {
  jq -r --unbuffered '
    select(.type == "result")
    | "Tokens: \(.usage.input_tokens // "?") in / \(.usage.output_tokens // "?") out | Cost: $\(.cost_usd // "?")"
  '
}

# Combined: text + tool calls for a rich pane display
extract_activity() {
  jq -r --unbuffered '
    if .type == "assistant" then
      .content[]? | (
        if .type == "text" then .text // empty
        elif .type == "tool_use" then "🔧 \(.name): \(.input | tostring | .[0:80])..."
        else empty
        end
      )
    elif .type == "result" then
      "✅ Done | Tokens: \(.usage.input_tokens // "?") in / \(.usage.output_tokens // "?") out"
    else empty
    end
  '
}
