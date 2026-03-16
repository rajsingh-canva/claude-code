# Zettelkasten Method — Core Principles

Based on Sonke Ahrens' *How to Take Smart Notes* and Odysseas' Obsidian implementation.

## Philosophy

- Build knowledge **from the bottom up** — capture individual ideas first, let structure emerge
- Resist perfectionism and over-engineering — minimalism is the goal
- The system serves reading, thinking, and writing — not the other way around
- Every feature must justify its existence; if it doesn't help you read/think/write, remove it

## Three Core Benefits

1. **Forces deliberate reading** — thorough note-taking replaces speed-reading, dramatically improving retention
2. **Instant feedback** (Feynman technique) — struggling to write an idea means you don't understand it yet
3. **Cross-disciplinary connections** — ideas from different fields mingle freely, enabling deeper understanding

## Note Types

### Rough Notes (Fleeting)
- Temporary jottings: ideas, reminders, reading lists, daily tracking
- Stored in `Rough Notes/` folder
- Disposable — not meant to persist long-term

### Source Notes (Literature)
- Created while consuming material (books, articles, videos, podcasts)
- Contain: page numbers, exact quotes, and your own elaboration in your own words
- Stored in `Source Material/` folder
- Context-dependent — tied to a specific source

### Main Notes (Permanent / Zettelkasten)
- Independent, self-explanatory "mini-essays" on a single idea
- Extracted from source notes but must stand alone without context
- Stored in `Main Notes/` folder (the single flat Zettelkasten folder)
- Maximum ~500 words, one core idea per note
- These are the building blocks for future writing projects

## Writing Rules

- Under 500 words per note
- One core idea per note — split if it grows
- Write in your own words — never just copy quotes
- Format with line breaks for readability
- Must be self-explanatory without the source

## Tagging Strategy

### Maturity Tags (Status)
- `#baby` — new, rough, poorly connected
- `#child` — developing, being refined
- `#adult` — finalized, well-connected
- `#quote` — contains a direct quotation

### Topical Tags
- Use specific personal-interest tags, not broad academic categories
- "dangers to male-female relationships" > "sociology"
- Limit to fewer than 4-5 tags per note
- Tags are implemented as empty notes with hyperlinks, not hashtags

## Linking Strategy

- Every main note links to related notes in a "References" section at the bottom
- Every main note links back to its source material note
- Links use Obsidian's `[[ ]]` wiki-link syntax
- When a tag accumulates 50+ linked notes, promote it to an Index with subheadings
