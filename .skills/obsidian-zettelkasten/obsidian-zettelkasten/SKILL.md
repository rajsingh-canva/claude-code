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
| `Templates/` | Note templates | Background |

Main Notes is a flat folder — no subfolders. All permanent notes live together to enable cross-disciplinary connections.

## Workflows

### Creating a New Main Note

When the user asks to create a note about a topic:

1. Determine if the user has source material or is working from general knowledge
2. If from source material, check if a source note exists; if not, create one first
3. Create the main note using the template from [assets/main-note-template.md](assets/main-note-template.md)
4. Write a mini-essay: one core idea, under 500 words, in the user's own voice
5. Assign maturity status `#baby`
6. Add 1-4 specific topical tags as `[[ ]]` links
7. Add references section with links to related notes and source material
8. Save to the user's `Main Notes/` folder

For template details and field guide, see [references/note-templates.md](references/note-templates.md).

### Creating a Source Note

When the user is taking notes on specific material (book, article, video):

1. Use the source note template from [assets/source-note-template.md](assets/source-note-template.md)
2. Record the medium, author, and title
3. For each key idea: capture the page/timestamp, exact quote if relevant, and elaboration in own words
4. Save to the user's `Source Material/` folder
5. After completing source notes, offer to extract main notes from the key ideas

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

## Obsidian-Specific Features

- **Tags as notes**: Tags are empty notes in the `Tags/` folder, linked via `[[ ]]` — not hashtags
- **Indexes**: When a tag has 50+ backlinks, promote it to an Index with subheadings in the `Indexes/` folder
- **Templates hotkey**: `Ctrl+T` / `Cmd+T` inserts the template
- **Backlinks**: Use Obsidian's backlinks panel to discover connections
- **Graph view**: Visualize note clusters and find isolated notes
- **Recommended plugins**: Only "Better word count" and "Smart random note" — avoid plugin bloat
