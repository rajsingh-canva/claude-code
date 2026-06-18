---
name: notebooklm
description: Query, create, and manage Google NotebookLM notebooks and sources via CLI. Use when any task requires asking questions against a NotebookLM notebook, adding or removing sources, or creating new notebooks. Triggers when another skill (e.g. mdm-profile-builder, research-notes) calls for a NotebookLM query, or when the user explicitly asks to query/manage NotebookLM.
---

# NotebookLM CLI

The `notebooklm` CLI is provided by the `notebooklm-py` package at `~/work/notebooklm-py/`.

For the full command reference, see the upstream skill bundled with the package:
`~/work/notebooklm-py/SKILL.md`

---

## Setup

```bash
source ~/work/notebooklm-py/.venv/bin/activate
```

Authenticate once after initial install (opens browser for Google OAuth):
```bash
notebooklm login
notebooklm list   # verify auth worked
```

Re-authenticate if commands fail with auth errors:
```bash
notebooklm login
```

---

## Quick Reference

```bash
# Status / health
notebooklm status                          # show active notebook + auth
notebooklm doctor                          # check environment health

# Notebooks
notebooklm list                            # list all notebooks
notebooklm create "Title"                  # create notebook

# Set context (single-agent only — use -n flag in parallel workflows)
notebooklm use <notebook-id>

# Sources
notebooklm source list [-n <id>]           # list sources
notebooklm source add <url> [-n <id>]      # add URL/YouTube/file
notebooklm source delete <source-id>       # remove source

# Querying
notebooklm ask "question"                  # query active notebook
notebooklm ask "question" -n <id>          # query specific notebook
notebooklm ask "question" --json           # structured output with citations
```

---

## Known Notebooks

| Name | ID | Used By |
|------|----|---------|
| Apple MDM Configuration Profiles | `d614f6db-63d3-4024-b264-e1f45ef787a2` | mdm-profile-builder |

---

## Error Handling

| Error | Fix |
|-------|-----|
| Auth / cookie error | `notebooklm login` |
| "No notebook context" | Use `-n <id>` flag or `notebooklm use <id>` |
| Rate limited | Wait 5–10 min, retry |
| Empty answer | Rephrase question; check sources are indexed (`notebooklm source list`) |
