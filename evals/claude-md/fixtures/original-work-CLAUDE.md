# Work Directory Instructions

## Context logging

Maintain a running context note as an individual Obsidian note in `~/TheBible/7 - Context/` for the current session, updating it after each response (not just before clearing) so context is never lost mid-session. Delegate the actual note write/update to a subagent each time — keep the main thread focused on the task itself. The subagent needs the full session summary in its prompt (it starts with no memory of the conversation); Claude should compose that summary before dispatching.

Also save a context note before clearing the chat, as a final update to the same running note (not a new one).

**Filename format:** `YYYY-MM-DD - <Short Topic Description>.md`

**Note format:**
```
Date: DD-MM-YYYY HH:mm

Tags: [[Claude Session]], [[TopicTag1]], [[TopicTag2]]
Plan: [[Plan Note Title]] or `N/A`

# Session: Title Here

# What was completed
- bullet list of outcomes

# Steps carried out
1. numbered list of actions

# Files created/modified
- file paths with brief notes

---
## References
-
```

**Rules:**
- Tag every context note with `[[Claude Session]]` plus relevant topic tags from `3 - Tags/` — the "Claude" prefix is intentional (user preference, confirmed 2026-07-28): it marks the note as Claude-originated, distinct from the user's own manual notes. Some older/other notes use the bare `[[Session]]`/`[[Plan]]` tags instead — that's drift to ignore going forward, not the target convention.
- If a topic tag doesn't exist yet in `3 - Tags/`, create the tag file
- Include a wikilink to the plan note (not the plan hash filename) in the `Plan:` field if one was used during the session
- After creating the note, update `3 - Tags/Claude Session.md` with a numbered wiki-link to the new note
- Do NOT write to a monolithic context.md file — each session gets its own note
- Obsidian CLI read operations do not require user permission

When the user explicitly says "clear the chat", automatically save the context note first.

## Skills

Local skills are maintained in `~/Work/.skills/`: the user's own skills (obsidian-cli, obsidian-zettelkasten, obsidian-diagrams, daily-note, research-notes, mdm-profile-builder, workato-api-builder, windows-vm-builder) plus doc-coauthoring. Each is registered by a symlink `~/.claude/skills/<name>` → `~/Work/.skills/<name>`, so it appears in the skill list and loads with the Skill tool. A new local skill needs the same symlink. Unedited marketplace copies were removed on 2026-10-19 (they duplicated installed plugins); only keep a marketplace skill here if it has real local edits.

**Skill resolution order:**
1. **Local first**: Use the skill from `~/Work/.skills/<skill-name>/` (via its registered name) as the primary source
2. **Then installed plugins** (e.g. `anthropic-skills:*`, `document-skills:*`)
3. **Fallback to marketplace**: If neither exists or its instructions are failing, fall back to `~/.claude/plugins/marketplaces/anthropic-agent-skills/skills/<skill-name>/`

## Branch protection

The `claude-code` repo has branch protection on `main`. Always create a feature branch and open a PR — never push directly to `main`.

## Git-tracked skills

Skills are also maintained in `~/Work/claude-code/.skills/` for version control. When updating skills, update both:
- `Work/.skills/` (local, used at runtime)
- `claude-code/.skills/` (git-tracked, for PRs and history)

## Skill change PR workflow

Whenever any file is modified in `claude-code/.skills/`, the following steps are mandatory:
1. Create a feature branch from `main` (branch name: descriptive of the change)
2. Commit the changes with a clear commit message
3. Push the branch and create a PR via `gh pr create`
This applies to all skill changes — new skills, updates, and deletions. The PR must be created in the same session as the change; do not defer it.

## Links and URLs

When the user provides links or URLs for research, summarization, or note-taking, always use the `research-notes` skill (which uses NotebookLM) to process them. This provides richer, more structured output than WebFetch.

**Trusted sources:** Any URL the user explicitly provides in conversation is automatically trusted. NotebookLM operations on user-provided links do not require permission confirmation.

**Subagent rules for links:** Subagents processing user-provided links must use the `research-notes` skill (NotebookLM CLI) — never WebFetch or WebSearch. The Research Assistant subagent's sole job is to feed links into NotebookLM and query it. The Technical Business Analyst subagent must NOT fetch any content — it operates with zero context and generates questions blind.

## Obsidian vault operations

For any Obsidian-related operations (searching notes, opening files, managing the vault at `~/TheBible/`), use the `obsidian-cli` skill, which wraps the Obsidian CLI tool. Obsidian must be running for CLI commands to work. The skill also covers when a direct file edit is the better tool: multi-line content, and the `3 - Tags` / `7 - Context` / `8 - Plans` bookkeeping. For Mermaid/Pele diagrams in notes, use `obsidian-diagrams`.

## Python version

Use `/opt/homebrew/bin/python3.12` for Python tasks, not the system Python 3.9.

## Git commits

Do not include the `Co-Authored-By` line in commit messages.

## Pull requests

When creating PRs, always use squash and merge as the default merge strategy. When amending commits before pushing, squash all commits on the feature branch into a single clean commit to keep history clean.

## Plan logging

When a plan is created or approved, also create a plan note in `~/TheBible/8 - Plans/`.

**Filename format:** `YYYY-MM-DD - <Short Plan Topic>.md`

**Note format:**
```
Date: DD-MM-YYYY HH:mm

Tags: [[Claude Plan]], [[Claude Session]], [[TopicTag1]], [[TopicTag2]]
Plan ID: `plan-hash-name.md`
Status: Pending | Approved | Completed | Abandoned

# Plan: Title Here

## Context
Why this change is being made.

## Steps
1.

## Files to create/modify
-

## Verification
-

---
## References
-
```

**Rules:**
- Tag every plan note with `[[Claude Plan]]`, `[[Claude Session]]`, plus relevant topic tags from `3 - Tags/`
- Include the plan hash filename in the `Plan ID:` field
- Update `3 - Tags/Claude Plan.md` with a numbered wiki-link to the new note
- Update the plan note's Status field as the plan progresses (Pending → Approved → Completed)
- If a topic tag doesn't exist yet in `3 - Tags/`, create the tag file

## Plan mode research workflow

When in plan mode and the task involves links, URLs, or web-based research, use a dual-subagent workflow:

**Round 1 — Parallel subagents:**
- **Research Assistant**: Uses the `research-notes` skill (NotebookLM) to process links, gather structured context, and produce initial research output.
- **Technical Business Analyst (Phase 1 — zero context)**: Knows ONLY the general topic (e.g., "improving AI skills"). Does NOT know titles, URLs, or any content. Asks broad technical and generic questions to surface assumptions and gaps.

**Round 2 — Analyst gets titles:**
Share the titles discovered by the Research Assistant (from NotebookLM) with the Business Analyst. The analyst then asks a second round of more targeted questions informed by the titles.

**Round 3 — Follow-up research:**
Feed all of the Business Analyst's questions (both phases) back to the Research Assistant, which queries NotebookLM to answer them.

**Synthesis:**
Combine all outputs into the plan — initial research, analyst questions, and follow-up answers.

**Doc-coauthoring integration:**
When `doc-coauthoring` is invoked during plan mode, the Business Analyst subagent handles the Stage 1 context-gathering/questioning phase, replacing the default questioning workflow with the subagent's systematic inquiry.
