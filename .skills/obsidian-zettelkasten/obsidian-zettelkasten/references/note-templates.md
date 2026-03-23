# Note Templates

All templates live in `~/TheBible/5 - Templates/`. **Always read the actual template file before creating a note** — never reproduce from memory.

## Template Catalog

### Zettelkasten Main Note Template.md

- **When to use**: Atomic permanent notes — one core idea, under 500 words
- **Frontmatter fields**: `Date`, `Status`, `Tags`
- **Save to**: `Main Notes/`

### Zettelkasten Source Note Template.md

- **When to use**: Taking notes on a specific book, article, video, or podcast
- **Frontmatter fields**: `Date`, `Type`, `Medium`, `Author`, `Title`, `Tags`
- **Save to**: `Source Material/`

### Note Taking Template.md

- **When to use**: General-purpose note-taking that doesn't fit Zettelkasten structure
- **Frontmatter fields**: `Date`, `Tags`
- **Save to**: `Rough Notes/`

### Daily Note Template - {{Date.md

- **When to use**: Daily journaling, task tracking, reflections
- **Frontmatter fields**: `Date`, `Tags` (pre-filled: `[[Daily]]`, `[[Note]]`, `[[Tasks]]`)
- **Save to**: `Rough Notes/`

### Code Block Script Template.md

- **When to use**: Documenting code projects, scripts, or programming work
- **Frontmatter fields**: `Date`, `Tags`
- **Sections**: Goal, Version, Code, Missing Features, Git
- **Save to**: `Rough Notes/`

### Proof of Concept Template.md

- **When to use**: Evaluating an idea — pros, cons, feasibility
- **Frontmatter fields**: `Date`, `Tags`
- **Sections**: Goal, Why, What, How, Solves, Misses, Related
- **Save to**: `Rough Notes/`

### How to Guide Template.md

- **When to use**: Step-by-step tutorials or how-to guides
- **Frontmatter fields**: `Date`, `Tags`
- **Sections**: Table of Contents, Heading, Subheading, Link, Steps
- **Save to**: `Rough Notes/`

### Book Summary Template.md

- **When to use**: Summarizing book chapters or key themes
- **Frontmatter fields**: `Date`, `Tags` (pre-filled: `[[Summary]]`)
- **Sections**: Summary of Chapter, Key Themes
- **Save to**: `Source Material/`

### Listening Tour - Temporary Template.md

- **When to use**: Onboarding conversations, listening tours
- **Frontmatter fields**: `Date`, `Tags` (pre-filled: `[[Canva]]`, `[[Listening Tour]]`, `[[Onboard]]`)
- **Save to**: `Rough Notes/`

## Field Guide

The user's templates use this frontmatter format (single colons, not double):

| Field | Format | Example |
|-------|--------|---------|
| Date | `Date:  {{Date}} {{Time}}` | Obsidian auto-fills on insert |
| Status | `Status: #baby` | Maturity tag for Zettelkasten notes |
| Tags | `Tags: [[tag1]] [[tag2]]` | Wiki-links to tag notes |
| Type | `Type: #source` | Note type identifier |
| Medium | `Medium: book` | book/article/video/podcast |
| Author | `Author: Name` | Creator of source material |
| Title | `Title: Full title` | Title of source material |

**Important format differences from the original skill templates**:
- Single colons (`Status:`) not double colons (`Status::`)
- Some templates have double-space before `{{Date}}` (e.g., `Date:  {{Date}} {{Time}}`)
- Tags use `[[ ]]` wiki-links, not hashtags
