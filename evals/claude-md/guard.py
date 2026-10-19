"""PreToolUse hook: keep an eval run inside its sandbox.

Blocks (exit 2) any Bash command that mentions the real home directory,
`~`, `$HOME` or the Obsidian/NotebookLM CLIs, and any Write/Edit outside the
sandbox. Every blocked call is appended to <sandbox>/guard.log.
"""

import json
import os
import re
import sys

SANDBOX = os.path.realpath(sys.argv[1])
HOME = os.path.realpath(os.path.expanduser("~"))

BASH_BLOCK = [
    (re.compile(r"(^|[\s'\"=:(])~(/|\s|$)"), "uses ~"),
    (re.compile(r"\$\{?HOME\b"), "uses $HOME"),
    (re.compile(re.escape(HOME) + r"(/|\b)"), "uses the real home directory"),
    (re.compile(r"(^|[;&|(`]\s*)(obsidian|notebooklm)\b"), "calls a real-vault/NotebookLM CLI"),
]


def block(reason, detail):
    with open(os.path.join(SANDBOX, "guard.log"), "a") as f:
        f.write(json.dumps({"reason": reason, "detail": detail}) + "\n")
    print(f"Blocked by eval sandbox: {reason}. Stay inside {SANDBOX}.", file=sys.stderr)
    sys.exit(2)


def main():
    event = json.load(sys.stdin)
    tool = event.get("tool_name", "")
    args = event.get("tool_input", {}) or {}
    if tool == "Bash":
        cmd = args.get("command", "")
        # Sandbox paths are fine even if the sandbox lives under $HOME.
        scrubbed = cmd.replace(SANDBOX, "<sandbox>").replace(sys.argv[1], "<sandbox>")
        for pattern, reason in BASH_BLOCK:
            if pattern.search(scrubbed):
                block(reason, cmd)
    elif tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = args.get("file_path") or args.get("notebook_path") or ""
        real = os.path.realpath(os.path.expanduser(path))
        # Claude Code's own per-session scratchpad (e.g. a PR body file) is fine too.
        scratch = real.startswith(f"/private/tmp/claude-{os.getuid()}/") and "/scratchpad/" in real
        if not (real == SANDBOX or real.startswith(SANDBOX + os.sep) or scratch):
            block(f"{tool} outside the sandbox", path)


if __name__ == "__main__":
    main()
