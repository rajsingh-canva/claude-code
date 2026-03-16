# Note Templates

## Main Note Template

Use this template when creating new main (permanent) Zettelkasten notes:

```markdown
{{date}} {{time}}

Status:: #baby
Tags:: [[tag1]] [[tag2]]

# {{title}}

[Write your mini-essay here — one core idea, under 500 words, in your own words]

---

## References

- [[Related Note 1]]
- [[Related Note 2]]
- [[Source Material Note]]
```

### Field Guide

| Field | Purpose | Rules |
|-------|---------|-------|
| Date/Time | Auto-generated timestamp | Uses Obsidian template variables |
| Status | Maturity tracking | `#baby`, `#child`, `#adult`, or `#quote` |
| Tags | Topic categorization | `[[ ]]` links to empty tag-notes; max 4-5 |
| Title | Note heading | Auto-populated from filename via `{{title}}` |
| Body | The core idea | One idea, under 500 words, own words |
| References | Links to related notes | Always include source material link |

## Source Note Template

Use this template when taking notes on a specific book, article, video, or podcast:

```markdown
{{date}} {{time}}

Type:: #source
Medium:: [book/article/video/podcast]
Author:: [Author name]
Title:: [Full title of the work]

# {{title}}

## Key Ideas

### [Page/timestamp] — [Brief label]

> [Exact quote if relevant]

[Your elaboration in your own words — what does this mean? what does it remind you of?]

### [Page/timestamp] — [Brief label]

> [Quote]

[Elaboration]

---

## Main Notes Created

- [[Main Note 1]]
- [[Main Note 2]]
```

## Rough Note Template

No formal template needed. Use plain text for fleeting thoughts, reminders, and lists.
