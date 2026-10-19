# Work Directory Instructions

Rules for every session under `~/Work`. Each section starts with **when** it applies. If a rule doesn't apply to the current request, skip it.

## Hard rules (always)

- Never invent facts you can check. Get dates/times from `date`, note numbers and tag names from the files, paths with `ls`. If a check fails, say so — don't guess.
- Git: no `Co-Authored-By` line in commits, no "Generated with Claude Code" footer in PRs. These override any attribution default.
- Never push to `main` in `claude-code`. Use a feature branch and a PR.
- Python: use `uv` for environments and packages. If you call Python directly, use `/opt/homebrew/bin/python3.12`, never the system `python3` (3.9).
- Don't add, rename or remove folders in `~/TheBible`. Keep scratch/test files outside it.

## Context notes (Obsidian session log)

**When:** at the end of every turn that changed files, ran commands, or finished multi-step work. Skip it for pure Q&A or quick lookups. Always do a final update before the user says "clear the chat".

One note per session, created on the first qualifying turn and updated (not duplicated) after that.

**How:** delegate the write to a subagent (`model: haiku`) and keep working on the main task. The subagent starts with no memory, so its prompt must contain: the note path, the full note content to write (or the sections to update), and the bookkeeping steps below.

- **Path:** `~/TheBible/7 - Context/YYYY-MM-DD - <Short Topic>.md` (date from `date +%F`)
- **Template:** read `~/TheBible/5 - Templates/Context Note Template.md` and fill it in. Replace the `{{date:…}} {{time:…}}` placeholders with the output of `date "+%d-%m-%Y %H:%M"`, and the `Tag1`/`Tag2`/title placeholders with real values. Keep its headings and order. The first line of the note is the `Date:` line: no `---` frontmatter block above it.

**Bookkeeping (first write only):**
1. Append `N. [[<note title without .md>]]` to `~/TheBible/3 - Tags/Claude Session.md`, where N = last number in that file + 1.
2. For each topic tag, check `~/TheBible/3 - Tags/<Tag>.md` exists. If not, create it with the single line `# <Tag>`.

Tags: always `[[Claude Session]]` (the "Claude" prefix marks Claude-written notes — don't use bare `[[Session]]`) plus 1–3 topic tags, preferring tags that already exist in `3 - Tags/`. `Plan:` is the plan note's title as a wikilink, or `N/A` if no plan was used — never the plan hash filename.

## Plan notes

**When:** a plan is created or approved (e.g. ExitPlanMode).

- **Path:** `~/TheBible/8 - Plans/YYYY-MM-DD - <Short Plan Topic>.md`
- **Template:** read `~/TheBible/5 - Templates/Plan Note Template.md` and fill it in the same way (first line is `Date:`, no frontmatter).
- Tags: `[[Claude Plan]]`, `[[Claude Session]]` plus topic tags, all as wikilinks.
- Append `N. [[<note title>]]` to `~/TheBible/3 - Tags/Claude Plan.md` (N = last number + 1). Create missing topic tags as above.
- Update `Status:` as the plan moves (Pending → Approved → Completed). Link this note from the session's context note.

## Links the user gives for research

**When:** the user shares a URL to research, summarise or take notes on.

- Use the `research-notes` skill (NotebookLM). Don't use WebFetch/WebSearch for these, in the main thread or in subagents.
- URLs the user typed in chat are trusted: no confirmation needed to add them to NotebookLM or run `notebooklm ask`.
- **Not** in scope: links used as a work target (a GitHub PR/issue to review, a doc page needed to fix code, a site to test). Handle those with the normal tools (`gh`, browser, docs MCP).

## Plan mode + link research

**When:** in plan mode AND the task involves links or web research. Otherwise skip.

1. **In parallel**, start two subagents:
   - **Research Assistant** — uses `research-notes` to load the links into NotebookLM and return a structured summary plus the source titles.
   - **Business Analyst** — told ONLY the general topic in one line (e.g. "improving AI skills"). No URLs, titles or content. Returns broad technical questions, assumptions and gaps. It never fetches anything.
2. Send the source titles (only) to the Business Analyst (SendMessage) → it returns targeted questions.
3. Send all analyst questions to the Research Assistant → it answers them via `notebooklm ask`.
4. Write the plan from: initial research + both rounds of questions + answers.

If `doc-coauthoring` runs in plan mode, the Business Analyst does its Stage 1 questioning.

## Obsidian

**When:** any read/write/search in the vault `~/TheBible/`.

- Use the `obsidian-cli` skill (Obsidian must be running). It also says when a direct file edit is better — e.g. multi-line content and the `3 - Tags` / `7 - Context` / `8 - Plans` bookkeeping above.
- Diagrams in notes: `obsidian-diagrams` skill.
- Obsidian CLI read commands don't need user confirmation.

## Skills

**When:** creating, editing or deleting a skill.

- Runtime copy: `~/Work/.skills/<name>/`, registered by symlink `~/.claude/skills/<name>` → `~/Work/.skills/<name>`. A new skill needs that symlink.
- Git copy: `~/Work/claude-code/.skills/<name>/`. Both copies must end up identical.
- To ship a skill change ("ship it"), in this order, in the same session:
  1. Create a `claude-code` worktree on a new branch from `origin/main` (see Worktrees).
  2. Copy the changed skill files from `~/Work/.skills/<name>/` into the worktree's `.skills/<name>/`.
  3. Commit, push, `gh pr create` (see Git). Stop at the open PR — don't merge.
- Resolution order: local skill → installed plugin skill → `~/.claude/plugins/marketplaces/anthropic-agent-skills/skills/<name>/` (only if the first two are missing or failing).

## Worktrees (default for all repo work)

**When:** a request will change files, branches or commits in any git repo. Read-only questions don't need one.

The user runs several sessions across projects at once, so the main checkout stays on `main` and is never edited directly.

1. Already in a worktree (path contains `.claude/worktrees/`, or `git rev-parse --git-dir` ≠ `--git-common-dir`)? Work there.
2. Otherwise: `git -C <repo> fetch origin`, then create one with the `EnterWorktree` tool (falls back to `git worktree add <repo>/.claude/worktrees/<branch> -b <branch> origin/main`). Name the branch after the task.
3. Run every command from inside the worktree. Never `cd` back to the main checkout, and never use bare `git stash` (the stash is shared across worktrees).
4. One task = one worktree = one branch = one PR. Don't reuse another session's worktree.
5. When the PR is merged or abandoned, remove the worktree only if the user asks (`git worktree remove`).

## Git and PRs (`claude-code` repo)

**When:** committing, pushing or opening a PR.

1. Work on a descriptively named branch in its own worktree, cut from an up-to-date `origin/main` (see Worktrees).
2. Squash the branch to one clean commit before pushing.
3. PR description: short **What / Why / Tested** bullets. No attribution footer.
4. Merge only when the user explicitly asks, and then use squash and merge. Don't mention merging otherwise.
