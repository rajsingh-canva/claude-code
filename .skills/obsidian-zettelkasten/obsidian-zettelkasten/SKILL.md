---
name: obsidian-zettelkasten
description: Create, review, and organize notes using the Zettelkasten method in Obsidian. Use when the user wants to create a new note about a topic, review or improve existing notes against Zettelkasten standards, get recommendations for note organization, or maintain consistent note-taking practices. Triggers on phrases like "create a note about", "new zettelkasten note", "review my notes", "improve this note", "how should I organize", "take notes on", or any request involving Obsidian note creation and management.
---

# Obsidian Zettelkasten

Create, review, and improve notes using the Zettelkasten method in Obsidian. Based on Sonke Ahrens' *How to Take Smart Notes*.

## Core Principles

For the full method reference, see [references/zettelkasten-method.md](references/zettelkasten-method.md).

Key rules to always follow:
- One core idea per note, under 500 words
- Write in your own words — never just copy quotes
- Every note must be self-explanatory without its source
- Link notes to related ideas and always back to the source material
- Use specific personal-interest tags, not broad academic categories
- Fewer than 4-5 tags per note
- Maturity tags: `#baby` (new), `#child` (developing), `#adult` (finalized), `#quote` (quotation)

## Vault Structure

The user's vault uses six folders:

| Folder | Purpose | Active? |
|--------|---------|---------|
| `Rough Notes/` | Fleeting ideas, reminders, lists | Active |
| `Source Material/` | Raw notes from books/articles/videos | Active |
| `Main Notes/` | Finalized atomic Zettelkasten notes | Active |
| `Tags/` | Empty notes used as tag targets | Background |
| `Indexes/` | Structured "contents pages" for large topics | Background |
| `5 - Templates/` | Note templates | Background |

Main Notes is a flat folder — no subfolders. All permanent notes live together to enable cross-disciplinary connections.

## Template Selection

The user has 9 templates in `~/TheBible/5 - Templates/`. When creating any note, select the best template based on user intent:

| User Intent | Template File | Signals |
|-------------|--------------|---------|
| Atomic idea / permanent note | `Zettelkasten Main Note Template.md` | "create a note about", single concept |
| Notes on a book/article/video | `Zettelkasten Source Note Template.md` | "notes on [source]", "reading [book]" |
| General note-taking | `Note Taking Template.md` | "take some notes", "jot down" |
| Daily journaling | `Daily Note Template - {{Date.md` | "daily note", "journal", "today" |
| Code project docs | `Code Block Script Template.md` | "code", "script", programming mentions |
| Evaluating an idea | `Proof of Concept Template.md` | "proof of concept", "evaluate", "pros and cons" |
| How-to / tutorial | `How to Guide Template.md` | "how to", "guide", "steps" |
| Book chapter summary | `Book Summary Template.md` | "summarize chapter", "book summary" |
| Onboarding conversation | `Listening Tour - Temporary Template.md` | "listening tour", "onboarding" |

**Key rule**: Always read the actual template file from `~/TheBible/5 - Templates/` before creating a note. Never reproduce a template from memory.

If the intent is ambiguous, ask the user which template to use.

For template details and field guide, see [references/note-templates.md](references/note-templates.md).

## Workflows

### Creating a New Main Note

When the user asks to create a note about a topic:

1. Determine if the user has source material or is working from general knowledge
2. If from source material, check if a source note exists; if not, create one first
3. Read the template from `~/TheBible/5 - Templates/Zettelkasten Main Note Template.md`
4. Create the main note following the template structure
5. Write a mini-essay: one core idea, under 500 words, in the user's own voice
6. Assign maturity status `#baby`
7. Add 1-4 specific topical tags as `[[ ]]` links
8. Add references section with links to related notes and source material
9. Save to the user's `Main Notes/` folder

### Creating a Source Note

When the user is taking notes on specific material (book, article, video):

1. Read the template from `~/TheBible/5 - Templates/Zettelkasten Source Note Template.md`
2. Create the source note following the template structure
3. Record the medium, author, and title
4. For each key idea: capture the page/timestamp, exact quote if relevant, and elaboration in own words
5. Save to the user's `Source Material/` folder
6. After completing source notes, offer to extract main notes from the key ideas

### Creating a General Note

When the user's request doesn't clearly map to a Zettelkasten main or source note:

1. Consult the Template Selection table above to identify the best-fit template
2. If ambiguous between two or more templates, ask the user to confirm
3. Read the selected template from `~/TheBible/5 - Templates/`
4. Create the note following the template structure
5. Save to the appropriate folder based on the note type (e.g., `Rough Notes/` for fleeting ideas)

### Reviewing and Improving Existing Notes

When the user asks to review notes or improve them:

1. Read the note(s)
2. Check against Zettelkasten standards:
   - Is it self-explanatory without context?
   - Is it focused on a single idea?
   - Is it under 500 words?
   - Are tags specific and limited (< 5)?
   - Does it have a references section with links?
   - Is the maturity tag appropriate?
3. Suggest specific improvements — rewrite sections if asked
4. If a note contains multiple ideas, suggest splitting into separate linked notes

### Recommending Note Organization

When the user asks for organization advice:

1. Check if any tags have accumulated many linked notes (candidates for Indexes)
2. Look for orphan notes with no links — suggest connections
3. Identify `#baby` notes that could be developed into `#child` or `#adult`
4. Suggest new connections between notes on related topics
5. Flag notes that are too long or contain multiple ideas

## Note Quality Checklist

Use this when reviewing any note:

- [ ] Single core idea (not multiple topics)
- [ ] Under 500 words
- [ ] Written in own words (not copied quotes)
- [ ] Self-explanatory without source context
- [ ] Has maturity tag (`#baby`/`#child`/`#adult`)
- [ ] Has 1-4 specific topical tags as `[[ ]]` links
- [ ] Has References section with related note links
- [ ] Links back to source material note
- [ ] Formatted with line breaks for readability

## Vault Operations via Obsidian CLI

For programmatic vault operations (searching notes, opening files, reading content, managing tags, checking backlinks), **load and use the `obsidian-cli` skill**. It wraps the Obsidian CLI tool and provides the complete command reference.

Key integrations:
- **Before creating a note**: Use `obsidian search` to check if a similar note already exists
- **After creating a note**: Use `obsidian backlinks` and `obsidian links` to verify connectivity
- **Organization reviews**: Use `obsidian orphans`, `obsidian deadends`, and `obsidian tags counts sort=count` to assess vault health
- **Template operations**: Use `obsidian create template=...` to create notes directly from vault templates
- **Property management**: Use `obsidian property:set` and `obsidian property:read` for frontmatter

## Obsidian-Specific Features

- **Tags as notes**: Tags are empty notes in the `Tags/` folder, linked via `[[ ]]` — not hashtags
- **Indexes**: When a tag has 50+ backlinks, promote it to an Index with subheadings in the `Indexes/` folder
- **Templates hotkey**: `Ctrl+T` / `Cmd+T` inserts the template
- **Backlinks**: Use Obsidian's backlinks panel to discover connections
- **Graph view**: Visualize note clusters and find isolated notes
- **Recommended plugins**: Only "Better word count" and "Smart random note" — avoid plugin bloat
