---
name: obsidian-cli
description: Interact with Obsidian vaults programmatically using the Obsidian CLI. Use when the user wants to search notes, open files in Obsidian, create or edit notes via CLI, list vault contents, manage tags/bookmarks/backlinks, check daily notes, or perform any vault operation from the terminal. Triggers on phrases like "obsidian cli", "open vault", "search notes", "edit note in obsidian", "find in vault", "list my notes", "open in obsidian", "daily note", vault management requests, or any Obsidian file operation.
---

# Obsidian CLI

Programmatic access to Obsidian vaults via the built-in CLI. Requires Obsidian desktop app to be running.

## Setup

The CLI is bundled with Obsidian and available at `/Applications/Obsidian.app/Contents/MacOS/obsidian`. It is registered in PATH via `~/.zprofile`:

```bash
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
```

**Important:** The CLI communicates with the running Obsidian app. Obsidian must be open for commands to work.

### Default Vault

The user's primary vault is **TheBible** at `~/TheBible/`. Target it explicitly when multiple vaults exist:

```bash
obsidian <command> vault=TheBible
```

## Command Syntax

```
obsidian <command> [key=value ...] [flags]
```

- `file=<name>` resolves by name (like wikilinks)
- `path=<path>` is an exact path (e.g., `Main Notes/my-note.md`)
- Quote values with spaces: `name="My Note"`
- Use `\n` for newline, `\t` for tab in content values
- Most commands default to the active file when `file`/`path` is omitted

## Quick Reference

### File Operations

| Task | Command |
|------|---------|
| Create a note | `obsidian create name="Note Title" content="..." vault=TheBible` |
| Create from template | `obsidian create name="Note Title" template="Template Name" vault=TheBible` |
| Read a note | `obsidian read file="Note Title" vault=TheBible` |
| Open in Obsidian | `obsidian open file="Note Title" vault=TheBible` |
| Open in new tab | `obsidian open file="Note Title" newtab vault=TheBible` |
| Append to note | `obsidian append file="Note Title" content="new text" vault=TheBible` |
| Prepend to note | `obsidian prepend file="Note Title" content="new text" vault=TheBible` |
| Delete a note | `obsidian delete file="Note Title" vault=TheBible` |
| Move/rename | `obsidian move file="Old Name" to="Folder/new-name.md" vault=TheBible` |
| Rename | `obsidian rename file="Old Name" name="New Name" vault=TheBible` |
| File info | `obsidian file file="Note Title" vault=TheBible` |
| Word count | `obsidian wordcount file="Note Title" vault=TheBible` |

### Search

| Task | Command |
|------|---------|
| Search vault | `obsidian search query="search term" vault=TheBible` |
| Search with context | `obsidian search:context query="search term" vault=TheBible` |
| Search in folder | `obsidian search query="term" path="Main Notes" vault=TheBible` |
| Case-sensitive | `obsidian search query="Term" case vault=TheBible` |
| JSON output | `obsidian search query="term" format=json vault=TheBible` |
| Count matches | `obsidian search query="term" total vault=TheBible` |
| Open search UI | `obsidian search:open query="term" vault=TheBible` |

### Vault Navigation

| Task | Command |
|------|---------|
| List all files | `obsidian files vault=TheBible` |
| Files in folder | `obsidian files folder="Main Notes" vault=TheBible` |
| File count | `obsidian files total vault=TheBible` |
| List folders | `obsidian folders vault=TheBible` |
| Vault info | `obsidian vault vault=TheBible` |
| List vaults | `obsidian vaults verbose` |
| Recent files | `obsidian recents vault=TheBible` |
| Random note | `obsidian random vault=TheBible` |

### Tags & Links

| Task | Command |
|------|---------|
| List all tags | `obsidian tags vault=TheBible` |
| Tags with counts | `obsidian tags counts sort=count vault=TheBible` |
| Tags for a file | `obsidian tags file="Note Title" vault=TheBible` |
| Tag info | `obsidian tag name="tagname" verbose vault=TheBible` |
| Backlinks | `obsidian backlinks file="Note Title" vault=TheBible` |
| Outgoing links | `obsidian links file="Note Title" vault=TheBible` |
| Orphan notes | `obsidian orphans vault=TheBible` |
| Dead-end notes | `obsidian deadends vault=TheBible` |
| Unresolved links | `obsidian unresolved vault=TheBible` |

### Daily Notes

| Task | Command |
|------|---------|
| Open daily note | `obsidian daily vault=TheBible` |
| Read daily note | `obsidian daily:read vault=TheBible` |
| Get daily path | `obsidian daily:path vault=TheBible` |
| Append to daily | `obsidian daily:append content="text" vault=TheBible` |
| Prepend to daily | `obsidian daily:prepend content="text" vault=TheBible` |

### Properties (Frontmatter)

| Task | Command |
|------|---------|
| List all properties | `obsidian properties vault=TheBible` |
| File properties | `obsidian properties file="Note" vault=TheBible` |
| Read property | `obsidian property:read name="status" file="Note" vault=TheBible` |
| Set property | `obsidian property:set name="status" value="draft" file="Note" vault=TheBible` |
| Remove property | `obsidian property:remove name="old-prop" file="Note" vault=TheBible` |

### Templates

| Task | Command |
|------|---------|
| List templates | `obsidian templates vault=TheBible` |
| Read template | `obsidian template:read name="Template Name" vault=TheBible` |
| Read with variables resolved | `obsidian template:read name="Template Name" resolve title="My Note" vault=TheBible` |
| Insert into active file | `obsidian template:insert name="Template Name" vault=TheBible` |

### Bookmarks

| Task | Command |
|------|---------|
| List bookmarks | `obsidian bookmarks vault=TheBible` |
| Bookmark a file | `obsidian bookmark file="Note Title" vault=TheBible` |
| Bookmark a heading | `obsidian bookmark file="Note" subpath="#Section" vault=TheBible` |

### Tasks (Checkboxes)

| Task | Command |
|------|---------|
| List all tasks | `obsidian tasks vault=TheBible` |
| Incomplete tasks | `obsidian tasks todo vault=TheBible` |
| Completed tasks | `obsidian tasks done vault=TheBible` |
| Tasks in file | `obsidian tasks file="Note" vault=TheBible` |
| Toggle task | `obsidian task path="Note.md" line=5 toggle vault=TheBible` |
| Daily tasks | `obsidian tasks daily vault=TheBible` |

### Plugins & Themes

| Task | Command |
|------|---------|
| List plugins | `obsidian plugins vault=TheBible` |
| Enabled plugins | `obsidian plugins:enabled vault=TheBible` |
| Enable plugin | `obsidian plugin:enable id="plugin-id" vault=TheBible` |
| Install plugin | `obsidian plugin:install id="plugin-id" enable vault=TheBible` |

### Sync & History

| Task | Command |
|------|---------|
| Sync status | `obsidian sync:status vault=TheBible` |
| Pause sync | `obsidian sync off vault=TheBible` |
| Resume sync | `obsidian sync on vault=TheBible` |
| File history | `obsidian history file="Note" vault=TheBible` |
| Read history version | `obsidian history:read file="Note" version=1 vault=TheBible` |
| Restore version | `obsidian history:restore file="Note" version=2 vault=TheBible` |

### Output Formats

Many commands support `format=` for structured output:
- `format=json` — machine-readable JSON
- `format=tsv` — tab-separated (default for most list commands)
- `format=csv` — comma-separated
- `format=text` — plain text (default for search)
- `format=md` — markdown (for base queries)

## Common Workflows

### Search and Open a Note

```bash
# Find notes about a topic
obsidian search:context query="machine learning" vault=TheBible

# Open the one you want
obsidian open file="Machine Learning Basics" vault=TheBible
```

### Create a Note from Template

```bash
# List available templates
obsidian templates vault=TheBible

# Create using a template
obsidian create name="New Zettelkasten Note" template="Zettelkasten Main Note Template" vault=TheBible open
```

### Quick Capture to Daily Note

```bash
obsidian daily:append content="Idea: explore connection between X and Y" vault=TheBible
```

### Find Orphan and Dead-End Notes

```bash
# Notes nothing links to
obsidian orphans vault=TheBible

# Notes that link to nothing
obsidian deadends vault=TheBible

# Broken links
obsidian unresolved vault=TheBible
```

### Vault Health Check

```bash
obsidian files total vault=TheBible
obsidian orphans total vault=TheBible
obsidian deadends total vault=TheBible
obsidian unresolved total vault=TheBible
obsidian tags counts sort=count vault=TheBible
```

## Error Handling

| Situation | Action |
|-----------|--------|
| Command hangs or no response | Ensure Obsidian desktop app is running |
| "Vault not found" | Check `obsidian vaults verbose` for available vaults |
| File not found with `file=` | Try `path=` with exact relative path instead |
| Command not recognized | Run `obsidian help` or `obsidian help <command>` |

## Integration with Zettelkasten Workflow

When used alongside the `obsidian-zettelkasten` skill:
- Use `obsidian search` to find related notes before creating new ones
- Use `obsidian backlinks` and `obsidian links` to verify note connectivity
- Use `obsidian orphans` to find notes that need linking
- Use `obsidian tags counts sort=count` to identify candidates for Index notes
- Use `obsidian create template=...` to create notes from vault templates
- Use `obsidian properties` to inspect and set frontmatter metadata
