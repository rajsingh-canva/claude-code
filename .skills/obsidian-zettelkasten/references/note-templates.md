# Note templates: field guide

Templates live in `~/TheBible/5 - Templates/` (13 as of 2026-10-19; `obsidian templates` lists the current set). Read the real file before every use. This page covers the conventions the files share and the quirks that are easy to get wrong.

## Header fields are plain lines, not YAML

Templates start with `Field: value` lines, not a `---` YAML frontmatter block. Keep it that way, so new notes match old ones and the user's searches keep working.

| Field | Format in the templates | Notes |
|---|---|---|
| `Date` | `Date: {{Date}} {{Time}}`. Some templates have two spaces after the colon; keep whatever the template has | When writing a file directly, fill it yourself as `DD-MM-YYYY HH:mm` |
| `Status` | `Status: #baby` | Maturity hashtag: `#baby` / `#child` / `#adult` / `#quote` (main notes) |
| `Tags` | `Tags: [[Tag One]], [[Tag Two]]` | Wikilinks to notes in `3 - Tags/` |
| `Type`, `Medium`, `Author`, `Title` | `Medium: book` … | Source notes |
| `Authors`, `Team/Group`, `Status`, `Due`, `Jira` | Plain values | Design doc; `Status:` here is a doc status (Draft/Review/Approved), not maturity |
| `Goal Owner`, `Goal Due Date`, `Contributors`, `Team`, `Jira` | Plain values | Goal doc |

`{{title}}`, `{{Date}}` and `{{Time}}` are Obsidian template variables. Creating through the CLI (`obsidian create path=… template=…`, or `template:read name=… resolve title=…`) fills them in. When writing the file directly, replace them yourself.

## Per-template notes

| Template | Pre-filled tags / sections | Watch out for |
|---|---|---|
| Zettelkasten Main Note | `Status:`, `Tags:`, `# {{title}}`, `# Purpose of Notes:`, `## References` | Keep the References section even when it's short |
| Zettelkasten Source Note | `Type`, `Medium`, `Author`, `Title`, `Tags` | One entry per key idea: location, quote, own words |
| Book Summary | `[[Summary]]`; Summary of Chapter, Key Themes | |
| Design Doc | `[[HLDD]], [[Design]], [[Draft]], [[Canva]]`; Background, Goals, Non-goals, Recommended Solution, … | Keeps a ` ```table-of-contents``` ` block (Automatic Table of Contents plugin). Leave it in place |
| Goal Doc | `[[Goals]], [[Canva]]` | Same table-of-contents block |
| How to Guide | Table of Contents, Steps | |
| Proof of Concept | Goal, Why, What, How, Solves, Misses, Related | |
| Code Block Script | Goal, Version, Code, Missing Features, Git | |
| Note Taking | `Date`, `Tags` | The catch-all |
| Listening Tour - Temporary | `[[Canva]], [[Listening Tour]], [[Onboard]]` | |
| Daily Note Template - {{Date | `[[Daily]]`, `[[Note]]`, `[[Tasks]]` | Owned by the `daily-note` skill |
| Context Note / Plan Note | | Owned by CLAUDE.md's logging rules. Those rules use `[[Claude Session]]` / `[[Claude Plan]]` tags, even though the template files still show the older `[[Session]]` / `[[Plan]]` |

Replace placeholder tags like `[[Tag1]]` with real tags, and remove any you don't use. A dangling `[[Tag1]]` creates an unresolved link.
