---
name: obsidian-cli
description: Work with the user's Obsidian vault (TheBible) through the official Obsidian CLI — search notes, read or open them, backlinks and outgoing links, orphans, tags, aliases, properties/frontmatter, templates, tasks, bases, bookmarks, quick capture to today's daily note, CSS snippets, themes and plugins, sync and file history, and checking how a note actually renders (screenshot, DOM, errors). Use whenever the user wants to find, open, inspect or manage anything in their Obsidian vault, even if they don't say "CLI", and to decide when a plain file edit is the better tool. For starting the daily note with Jira/Slack use daily-note; for Zettelkasten note content use obsidian-zettelkasten; for diagrams use obsidian-diagrams.
---

# Obsidian CLI

Obsidian ships a CLI that talks to the running app, so it sees what Obsidian sees: the link graph, tags, properties, templates, tasks, sync history, and the rendered page. The vault itself is plain markdown on disk at `~/TheBible`, though, so for writing content a direct file edit is often the better tool. Picking the right one is most of the skill.

## Setup and health check

- The CLI is a separate binary, `/Applications/Obsidian.app/Contents/MacOS/obsidian-cli`. Obsidian's setting (Settings → General → Command line interface) links it as **`/opt/homebrew/bin/obsidian`** on this Mac.
- Check it with `readlink "$(command -v obsidian)"`, which should end in `obsidian-cli`.
- `~/.zprofile` also adds `…/Obsidian.app/Contents/MacOS` to `PATH`. That's harmless while `/opt/homebrew/bin` comes first. Never `export` that directory yourself: on macOS's case-insensitive disk, a bare `obsidian` there resolves to the GUI app, and commands turn into "would like to control Obsidian" prompts.
- **The app must be running.** If commands hang or fail, run `pgrep -x Obsidian || open -ga Obsidian`, wait a few seconds, and retry. Do this yourself rather than asking the user. If it still won't answer, fall back to direct file operations for anything that doesn't need the index.
- **The CLI sometimes keeps running after printing its result.** In scripts, use a hard timeout (`timeout -s KILL 20 obsidian …`, or a subprocess timeout) and keep whatever it printed.
- The user's vault is **TheBible**. Pass `vault=TheBible` whenever more than one vault could be open; it's harmless otherwise.

## CLI or direct file edit?

| Job | Use | Why |
|---|---|---|
| Write or replace note content: anything multi-line, or containing backticks, quotes, code, diagrams or backslashes | **Write/Edit the file** at `~/TheBible/<path>.md` | `content=` turns `\n`/`\t` into newline/tab with no way to escape a literal backslash, and shell quoting mangles the rest |
| Append a block or line to a note, or a numbered entry to an index (tag indexes, context/plan notes) | `scripts/vault_note.py append [--tight]` / `append-index` | `obsidian append` inserts a newline before the text, so a file already ending in one gets a stray blank line |
| Create a missing tag note | `scripts/vault_note.py ensure-tag <Tag>` | Uses the vault's tag style (`\n# Tag`) |
| `7 - Context/`, `8 - Plans/`, `3 - Tags/` bookkeeping | Direct file I/O (+ `vault_note.py`) | Plain files with fixed formats; no index needed |
| Search, backlinks/links, orphans, unresolved links, tags, tasks, properties, outline | **CLI** | It uses Obsidian's index and resolves links like Obsidian does. `obsidian search` is much faster than grep across the vault |
| Create from an Obsidian template; resolve template variables | **CLI** (`create template=…`, `template:read resolve`) | Template variables are resolved by Obsidian |
| Open or show something to the user | **CLI** (`open`, `daily`, `search:open`) | Only the app can do it |
| Rename or move a note | **CLI** (`rename`, `move`) | Obsidian updates every link to it; `mv` would break them |
| Check how a note renders | **CLI** (`dev:screenshot`, `dev:dom`, `dev:errors`) | See "Checking rendered output" below |

**After writing a file directly, give the index a second or two** before running a CLI command that looks it up. Straight after a direct write, `obsidian append path=…` can report "File not found".

## Syntax

```
obsidian <command> [key=value ...] [flags] vault=TheBible
```
- `path=` is exact and vault-relative (`6 - Main Notes/My Note.md`, with no `TheBible/` prefix). `file=` resolves a name like a wikilink. **Always pass `path=` or `file=` in automation.** Without them, most commands act on whatever note is active, which could be anything.
- Quote values with spaces: `name="My Note"`. Flags are bare words (`total`, `counts`, `inline`, `open`).
- Many list commands take `format=json|tsv|csv`; prefer `json` when you'll parse the output.

## Core commands

| Task | Command |
|---|---|
| Search (fast, index-backed) | `obsidian search query="term" [path="6 - Main Notes"] [limit=20] [format=json]` |
| Search with surrounding lines | `obsidian search:context query="term"` |
| Read a note | `obsidian read path="…"` (or just Read the file) |
| Heading outline | `obsidian outline path="…" [format=json]` |
| Open for the user | `obsidian open path="…" [newtab]` |
| Backlinks / outgoing links | `obsidian backlinks path="…" [counts]` · `obsidian links path="…"` |
| Orphans / dead ends / broken links | `obsidian orphans` · `obsidian deadends` · `obsidian unresolved [verbose]` |
| Tags | `obsidian tags counts sort=count` · `obsidian tags path="…"` · `obsidian tag name="x" verbose` |
| Aliases | `obsidian aliases path="…"` |
| Properties | `obsidian properties path="…"` · `property:read` / `property:set name=… value=…` / `property:remove` |
| Templates | `obsidian templates` · `template:read name="…" resolve title="…"` · `create path="…" template="…"` |
| Create (refuses if it exists) | `obsidian create path="Folder/Name.md" [template="…"] [open]` |
| Rename / move (links updated) | `obsidian rename path="…" name="New"` · `obsidian move path="…" to="Folder/New.md"` |
| Tasks | `obsidian tasks todo` · `tasks path="…"` · `task path="…" line=5 toggle` |
| Daily note | `obsidian daily:path` · `daily:read` · `daily:append content="one line"` |
| Bases | `obsidian bases` · `base:query path="…" [view="…"] format=json` |
| Bookmarks | `obsidian bookmarks` · `bookmark file="…"` |
| CSS snippets | `obsidian snippets` · `snippets:enabled` |
| Vault info | `obsidian vault` · `obsidian files folder="…" [total]` · `obsidian folders` · `obsidian version` |
| File history | `obsidian history path="…"` · `history:read path="…" version=N` · `diff path="…" from=1 to=2` |

The full list (about 100 commands with every flag) is in `references/commands.md`. `obsidian help <command>` is always the final word.

## What needs the user's OK

- **Run freely:** everything read-only (search, read, list, links, tags, properties, outline, history, `version`). The user has said reading their notes never needs permission.
- **Fine within the task:** creating notes, appending, setting properties, toggling tasks, opening notes, renaming or moving notes the task is about.
- **Ask first:**
  - Creating, renaming, moving or deleting **folders**. The user's numbered folder layout is deliberate, and Sync pushes every change to all devices. Keep scratch and test files outside the vault.
  - `delete`: it goes to the system Trash. Never use `permanent`.
  - `create … overwrite`.
  - `history:restore` / `sync:restore`.
  - `sync off`.
  - `plugin:install`/`uninstall`/`enable`/`disable`, `theme:install`/`set`, `snippet:enable`/`disable`.
  - `reload` / `restart`.
  - `command id=…` for anything that isn't read-only.
  - Any `eval` or `dev:cdp` that changes state.

  These change data, settings, or how every note looks.

## Checking rendered output

When the question is "does it actually show up right?":
- `obsidian dev:screenshot path=/absolute/path.png`. **Always give an absolute path.** A relative one lands in the vault, and Sync copies it to every device.
- `obsidian dev:dom selector="…" [text|all|attr=…]` queries the rendered page. `obsidian dev:errors [clear]` shows captured errors. `dev:console` needs `dev:debug on` first, and `dev:debug off` afterwards.
- `obsidian eval code="…"` runs JavaScript inside the app (`app.workspace`, `app.vault`, …) and awaits promises. Read-only inspection is fine. Never pass note content or other untrusted text inside `code=`; base64-encode it instead.
- For diagrams, use `obsidian-diagrams`' `check_diagrams.py`. It does all of this safely.

## Vault map

`1 - Rough Notes` · `2 - Source Material` · `3 - Tags` (tag notes, linked as `[[Tag]]`) · `4 - Indexes` · `5 - Templates` · `6 - Main Notes` · `7 - Context` (Claude session notes) · `8 - Plans` (Claude plan notes). Confirm with `obsidian folders` if anything looks off.

## Helpers

- `scripts/vault_note.py`: `append-index`, `ensure-tag`, `append` (see its `--help`). Python 3.12, stdlib, works without the app.
- `references/commands.md`: the full CLI reference (Obsidian 1.14.4).

Related skills: `obsidian-zettelkasten` (what to write and where), `daily-note` (the Jira/Slack daily note workflow), `obsidian-diagrams` (Mermaid/Pele diagrams).
