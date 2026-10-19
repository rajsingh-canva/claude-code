---
name: obsidian-zettelkasten
description: Create, review and organise notes in the user's Obsidian vault with their Zettelkasten method (Sönke Ahrens' How to Take Smart Notes) and their own templates. Use when the user wants a new note about an idea, notes on a book/article/video, a design doc, goal doc, how-to guide, proof of concept or book summary from their templates, or wants notes reviewed, improved, split, linked, tagged or organised (indexes, orphans, maturity). Triggers on "create a note about", "take notes on", "write this up in Obsidian", "review my notes", "how should I organise". Not for Claude's own session and plan notes in 7 - Context / 8 - Plans (CLAUDE.md defines those), the daily note (daily-note), or diagrams (obsidian-diagrams).
---

# Obsidian Zettelkasten

The user keeps a Zettelkasten in Obsidian (vault **TheBible**, `~/TheBible`), based on Sönke Ahrens' *How to Take Smart Notes*. Your job is to make notes the way they do: the same templates, the same places, and the same standards. Don't impose a generic note style.

## What a good note is here, and why

- **One idea per note, under ~500 words.** Small notes can be linked and reused; big ones become dead ends. If a note grows a second idea, split it and link the two.
- **In the user's own words, self-explanatory without the source.** A note that only makes sense next to its book can't connect to anything else. Quotes are fine as evidence, never as the note itself.
- **Linked.** A `References` section links related notes and the source note. Links are what make a Zettelkasten useful rather than just a folder.
- **Tags are notes.** A tag is a note in `3 - Tags/`, written as a `[[Tag]]` wikilink, not a `#hashtag`. Keep 1–4 specific, personal tags ("device compliance automation" beats "IT").
- **Maturity status:** `#baby` (new), `#child` (developing), `#adult` (finished), `#quote`. New notes start at `#baby`. This one *is* a hashtag, on the `Status:` line.
- **Minimal plugins.** The user deliberately avoids plugin bloat, so don't suggest plugins to solve note problems.

The method in more depth: `references/zettelkasten-method.md`.

## Vault map

| Folder | Holds |
|---|---|
| `1 - Rough Notes/` | Fleeting notes, daily notes, working drafts, handoffs |
| `2 - Source Material/` | Notes on a specific source, in subfolders by kind (`Articles/`, `Books/`, `Technical Documentation/`, …) |
| `3 - Tags/` | Tag notes (`[[Tag]]` targets) |
| `4 - Indexes/` | Index notes grouped in category subfolders (`Device Management/`, `Scripting and Automation/`, …) |
| `5 - Templates/` | Note templates |
| `6 - Main Notes/` | Permanent notes, and finished docs (design and goal docs). **Flat: no subfolders**, so ideas from different areas sit together |
| `7 - Context/`, `8 - Plans/` | Claude's session and plan notes. They follow CLAUDE.md's formats, not this skill |

Folders drift, so confirm with `obsidian folders` (or `ls ~/TheBible`) if something doesn't match. Never add, rename or remove folders unless the user asks; put a note in the closest existing folder and say so.

## Choosing a template

Always read the template file from `~/TheBible/5 - Templates/` before writing. The user edits templates, and a remembered copy will be out of date. `obsidian templates` lists what exists right now.

| The user wants | Template | Save to |
|---|---|---|
| A permanent note on one idea ("create a note about X") | `Zettelkasten Main Note Template.md` | `6 - Main Notes/` |
| Notes on a book/article/video/podcast | `Zettelkasten Source Note Template.md` | `2 - Source Material/<kind>/` |
| A book chapter summary | `Book Summary Template.md` | `2 - Source Material/Books/` |
| A high-level design doc | `Design Doc Template.md` | `6 - Main Notes/` |
| A goal doc | `Goal Doc Template.md` | `6 - Main Notes/` |
| A how-to or tutorial | `How to Guide Template.md` | `6 - Main Notes/` if finished, `1 - Rough Notes/` if a draft |
| Weighing up an idea | `Proof of Concept Template.md` | `1 - Rough Notes/` |
| Documenting a script or code project | `Code Block Script Template.md` | `1 - Rough Notes/` |
| General notes, jotting | `Note Taking Template.md` | `1 - Rough Notes/` |
| Onboarding or listening-tour conversation | `Listening Tour - Temporary Template.md` | `1 - Rough Notes/` |
| Daily note | → use the `daily-note` skill | |
| Claude session or plan note | → follow CLAUDE.md (Context/Plan Note templates) | `7 - Context/`, `8 - Plans/` |

If two templates fit equally well, ask which one. A wrong template means rewriting the note. Field formats and template quirks: `references/note-templates.md`.

## Workflows

**New permanent note**
1. Check it doesn't already exist: `obsidian search query="<key terms>" path="6 - Main Notes"`. If a close match exists, offer to extend that note instead.
2. If it comes from a source and no source note exists, offer to create the source note first, so the main note has something to link back to.
3. Read the template, then write one idea in the user's voice, under 500 words. Use `Status: #baby` and 1–4 `[[Tag]]` links (create missing tag notes with `obsidian-cli`'s `vault_note.py ensure-tag`). Add a References section with related notes and the source.
4. Write the file directly to `~/TheBible/6 - Main Notes/<Title>.md`. Then check its links with `obsidian links path="…"`; any `unresolved` link is a typo or a note still to write.

**Source note:** read the template. Record the medium, author and title. For each key idea, give the page or timestamp, a quote if useful, and the idea in the user's own words. Save under `2 - Source Material/<kind>/`. Then offer to pull main notes out of it.

**Doc from a template** (design, goal, how-to, PoC, code): fill the template's sections from what the user gave you. Keep its fields (`Tags:`, `Status:`, `Jira:` …) and its `table-of-contents` block. Leave a field blank rather than inventing a value.

**Reviewing a note:** go through the checklist below and suggest specific edits. Rewrite only if asked. If a note holds two ideas, propose the split, with titles.

**Organising the vault:**
- `obsidian orphans` / `obsidian deadends` give notes needing links.
- `obsidian tags counts sort=count` shows tags; a tag past ~50 notes is a candidate for an index in `4 - Indexes/<category>/`.
- `#baby` notes that are ready to grow are another target.
- Report the findings first, then make changes once the user agrees.

**When an idea is relational** (a process, a hierarchy, a comparison, cause and effect), a small diagram often says it better than a paragraph. Use the `obsidian-diagrams` skill. Index notes in particular suit a `mindmap`.

## Note checklist

- [ ] One core idea, under ~500 words
- [ ] Own words; understandable without the source
- [ ] `Status:` maturity tag (`#baby`/`#child`/`#adult`/`#quote`)
- [ ] 1–4 specific `[[Tag]]` links; tag notes exist in `3 - Tags/`
- [ ] References section with related notes, plus a link back to the source note
- [ ] Short paragraphs, readable at a glance

Vault mechanics (search, links, tags, properties, templates, safe file writes) are in the `obsidian-cli` skill.
