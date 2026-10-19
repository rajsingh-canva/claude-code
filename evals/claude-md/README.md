# CLAUDE.md eval harness

Compares two (or more) versions of `~/Work/CLAUDE.md` by running real `claude -p` sessions,
with real tool calls, in throwaway sandboxes, then checking the files each run wrote with a script.

```bash
uv run --python 3.12 evals/claude-md/run.py evals/claude-md/fixtures/original-work-CLAUDE.md config/work-CLAUDE.md --labels old new
```

Defaults: Opus, Sonnet and Haiku 5.5, 2 reps, 6 runs at a time, all scenarios. Narrow it with
`--models`, `--scenarios`, `--reps`, `--jobs`. It prints one line per run and a Markdown table
(also saved as `results.md` in the output dir). `--regrade OUT` re-runs the checks on an old
output dir without calling Claude again.

## What each run gets

A new folder (under `$TMPDIR/claude-md-eval/` unless you pass `--out`) holding:

- `vault/` — a copy of `3 - Tags`, `5 - Templates`, `7 - Context` and `8 - Plans`, snapshotted from `~/TheBible` once per eval.
- `work/CLAUDE.md` — the file under test with `~/TheBible`, `~/Work`, `~/.claude/skills` and `~/.claude/plans` rewritten to sandbox paths.
- `work/claude-code/` — a git repo whose `origin` is a local bare repo. `origin/main` is one commit ahead of the clone, so a run must fetch to branch from it.
- `work/.skills/demo-skill/` — the edited runtime copy of a skill; the repo has the old one.
- `bin/gh` — a stub that logs every call to `gh-calls.jsonl` and never contacts GitHub.

Claude runs with `--setting-sources project --permission-mode acceptEdits --add-dir <sandbox>`,
an allowlist (Read/Write/Edit/Glob/Grep/Agent and Bash for git, date, ls, cat, gh, uv, …), and a
PreToolUse hook (`guard.py`) that blocks Write/Edit outside the sandbox and any Bash command
naming `~`, `$HOME`, your home path or the Obsidian/NotebookLM CLIs. Blocked calls fail the
`stayed_in_sandbox` check. Git uses a sandbox `GIT_CONFIG_GLOBAL`.

## Scenarios (`scenarios.py`)

| scenario | prompt | checked |
|---|---|---|
| context_note | write the context note for an Ansible fix | one note; `YYYY-MM-DD - Topic` filename; `Date:` line matches the real clock; `[[Claude Session]]` + 1–3 topic tags (prefers existing `Ansible`); `Plan: N/A`; template headings; next number appended to `Claude Session.md`; new tag files are just `# Tag` |
| plan_note | do the bookkeeping for an approved plan | plan note from the plan template; `Status: Approved`; `Plan ID` = plan file; `[[Claude Plan]]` + `[[Claude Session]]`; next number in `Claude Plan.md`; context note links the plan |
| skill_ship | "ship" an edited skill | worktree used; one branch pushed, cut from the new `origin/main`, one commit, skill copied; no `Co-Authored-By`; `gh pr create` called with no Claude footer; no merge; `main` not pushed |
| new_tag | context note that must use a new `Zigbee2MQTT` tag | tag file created containing only `# Zigbee2MQTT` and used in the note |
| trivial_qa | one-paragraph git question | no subagent (from stream-json), no writes, vault unchanged |
| python | run a Python one-liner | every Python call uses `uv run` or `/opt/homebrew/bin/python3.12` |

Every scenario also checks that no new vault folders appeared. A run passes when all its checks pass.

## Safety

Nothing points at the real vault or repos: the vault is copied, the git repos are created from
scratch, `gh` is stubbed, `GH_TOKEN`/`GITHUB_TOKEN` are dropped and `GH_CONFIG_DIR` is empty.
At the end the harness lists any real-vault file modified during the eval (other sessions can
cause these, so check them).

`fixtures/original-work-CLAUDE.md` is the pre-optimisation `~/Work/CLAUDE.md`, kept as a baseline.
