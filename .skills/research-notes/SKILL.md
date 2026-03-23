---
name: research-notes
description: Research and summarize YouTube videos, web articles, and other URLs into structured markdown notes using NotebookLM. Use when the user provides one or more links (YouTube, URLs, PDFs) and wants notes, a written summary, structured research output, or a documented writeup. Triggers on phrases like "take notes on", "summarize this video/article", "research these links", "make notes from", "write up this video", followed by one or more URLs.
---

# Research Notes

Convert YouTube videos, web articles, PDFs, and other URLs into structured markdown notes using NotebookLM as the intelligence layer.

## Prerequisites: NotebookLM CLI

This skill uses the `notebooklm` CLI tool (notebooklm-py). **Before executing any step below, load and follow the `notebooklm` skill** for:

- Complete command reference and available flags (Quick Reference table)
- JSON output schemas for `list`, `source add`, `ask`, `create`, etc.
- Autonomy rules — which commands run automatically vs. require confirmation
- Parallel safety rules — when to use `-n <notebook_id>` vs. `notebooklm use`
- Exit codes and error handling decision tree
- Authentication: run `notebooklm status` first; if it fails, run `notebooklm login`

The notebooklm skill is the authoritative reference for all CLI behavior. This skill focuses on the research-notes workflow built on top of it.

---

## Workflow

1. Collect all links from the user (prompt if none provided)
2. Resolve which notebook to use (see Notebook Management)
3. Add all sources to the notebook
4. Wait for sources to process
5. Query NotebookLM to extract structured content
6. Compile and write the markdown document
7. Save to local file and update index
8. Offer doc-coauthoring for further refinement

---

## Section 1: Notebook Management

### Context detection

Determine which notebook strategy to use:

1. **Plan context** (plan mode is active, or the user references an active plan) → go to [Plan notebook](#plan-notebook)
2. **Standalone research** (no plan involved) → go to [Standalone notebook](#standalone-notebook)
3. **User explicitly names a notebook** → go to [Explicit new notebook](#explicit-new-notebook)

### Plan notebook

When research is triggered during a plan, create a dedicated notebook scoped to that plan. This keeps sources isolated per plan and allows cleanup when the plan completes.

1. **Derive the notebook name:** `plan-<slugified-plan-topic>` (e.g., plan topic "Auth Middleware Rewrite" → `plan-auth-middleware-rewrite`)
2. **Check for existing notebook:**
   ```bash
   notebooklm list --json
   ```
   Search the `notebooks` array for a title matching `plan-<slug>` (case-insensitive).
3. **Found:** Run `notebooklm use <id>` and store as `$NOTEBOOK_ID`.
4. **Not found:** Create it:
   ```bash
   notebooklm create "plan-<slug>" --json
   ```
   Parse `id` → store as `$NOTEBOOK_ID`. Create local folder `~/Work/NotebookLM/plan-<slug>/`.
5. **Update index:** Append to `~/Work/NotebookLM/index.md`:
   ```
   | plan-<slug> | <id> | <YYYY-MM-DD> | active |
   ```

### Standalone notebook

When research is NOT part of a plan, use the persistent `research-assistant` notebook.

**Resolve the notebook:**
```bash
notebooklm list --json
```
Parse the `notebooks` array. Search for `"title": "research-assistant"` (case-insensitive).

- **Found:** Run `notebooklm use <id>` and store the notebook ID as `$NOTEBOOK_ID`.
- **Not found:** Create it:
  ```bash
  notebooklm create "research-assistant" --json
  ```
  Parse `id` → store as `$NOTEBOOK_ID`. Create local folder `~/Work/NotebookLM/research-assistant/`.

No lifecycle cleanup applies to the standalone notebook.

### Explicit new notebook

If the user says "create a new notebook" or names a specific notebook:
```bash
notebooklm create "<name>" --json
```
- Parse `id` → store as `$NOTEBOOK_ID`
- Slugify the name: lowercase, spaces → hyphens, strip special chars
- Create local folder: `~/Work/NotebookLM/<slugified-name>/`
- Append to `~/Work/NotebookLM/index.md`:
  ```
  | <name> | <id> | <YYYY-MM-DD> | active |
  ```

### Notebook cleanup

When a plan's status transitions to **Completed**:

1. Look up the plan's notebook ID from `~/Work/NotebookLM/index.md` — match by `plan-<slug>` name
2. Delete the remote notebook:
   ```bash
   notebooklm delete <id>
   ```
3. Update the notebook's row in `index.md`: change Status from `active` to `deleted`
4. **Keep all local files** — the markdown notes in `~/Work/NotebookLM/plan-<slug>/` are the permanent research record
5. If the notebook is not found (already deleted), skip silently

### Local folder structure

```
~/Work/NotebookLM/
├── index.md                          # All notebooks: name, ID, created date, status
├── research-assistant/
│   └── <YYYY-MM-DD>-<slug>.md        # One file per research session
└── plan-<topic-slug>/
    └── <YYYY-MM-DD>-<slug>.md
```

**First-use bootstrap:** If `~/Work/NotebookLM/` or `index.md` do not exist, create them. Initialize `index.md` with:
```markdown
# NotebookLM Index

| Notebook | ID | Created | Status |
|----------|----|---------|--------|
```

**Migration:** If the existing `index.md` has no Status column, add it and default all existing rows to `active`.

---

## Section 2: Adding Sources

For each URL provided by the user:
```bash
notebooklm source add "<url>" --notebook $NOTEBOOK_ID --json
```
Capture each `source_id` from the JSON response. Supported types: YouTube URLs, web URLs, PDFs, Google Docs, audio/video files, images.

### Waiting for processing

**1–2 sources — wait inline:**
```bash
notebooklm source wait <source_id> -n $NOTEBOOK_ID --timeout 120
```

**3+ sources — spawn a background agent (Task tool):**

Prompt for the agent:
```
Wait for sources [<id1>, <id2>, <id3>, ...] in notebook <NOTEBOOK_ID>.
For each source_id, run:
  notebooklm source wait <id> -n <NOTEBOOK_ID> --timeout 120
Report when all are ready. If any fail (exit code 1), log the error and continue with the rest.
```

If any source fails, log the error and continue with the remaining ready sources.

---

## Section 3: Extracting Content via NotebookLM

After all sources are ready, run these queries in sequence. Use `--notebook $NOTEBOOK_ID` on each command. Parse the `answer` field from each JSON response.

**Step 1 — Get outline:**
```bash
notebooklm ask "What are the main topics and sections covered across all sources? List them as a structured outline with 3–7 main sections." --notebook $NOTEBOOK_ID --json
```

**Step 2 — Deep-dive each section:**

For each major section from Step 1:
```bash
notebooklm ask "For the section '<section name>', explain the key ideas, arguments, and details in depth." --notebook $NOTEBOOK_ID --json
```

**Step 2a — Content type detection:**
```bash
notebooklm ask "Classify this content into exactly ONE of these types: (1) tutorial — teaches how to do something step-by-step, (2) technical-docs — API reference, library docs, or specification, (3) opinion — analysis, review, or commentary with arguments, (4) news — announcement, release notes, or industry update, (5) interview — conversation, podcast, or Q&A with identifiable speakers, (6) general — none of the above. Answer with the type name and a one-sentence description of what the content covers." --notebook $NOTEBOOK_ID --json
```
Parse the content type from the response. Run the matching content-type queries below, then continue to Step 3.

**Step 2b — Tutorial content** (type = tutorial):
```bash
notebooklm ask "What specific setup steps, installations, configurations, or prerequisites does the content show? Include exact commands, file paths, settings, templates, code snippets, or software versions mentioned. List them as numbered steps." --notebook $NOTEBOOK_ID --json
```
```bash
notebooklm ask "What tips, tricks, best practices, common mistakes, or troubleshooting guidance does the content provide? What does the creator warn viewers NOT to do or to watch out for?" --notebook $NOTEBOOK_ID --json
```

**Step 2c — Technical documentation** (type = technical-docs):
```bash
notebooklm ask "What are the key APIs, functions, parameters, or configuration options documented? Include exact signatures, required vs optional parameters, default values, and return types where available." --notebook $NOTEBOOK_ID --json
```
```bash
notebooklm ask "What code examples, usage patterns, or integration snippets does the documentation provide? Include any version requirements, compatibility notes, or deprecation warnings." --notebook $NOTEBOOK_ID --json
```

**Step 2d — Opinion/analysis** (type = opinion):
```bash
notebooklm ask "What are the author's key arguments or positions? For each, what evidence or reasoning do they provide? Are there any counterarguments or limitations they acknowledge?" --notebook $NOTEBOOK_ID --json
```

**Step 2e — News/announcements** (type = news):
```bash
notebooklm ask "What specifically changed or was announced? What is the timeline or release date? Who is affected and what is the expected impact? Are there any migration steps or action items mentioned?" --notebook $NOTEBOOK_ID --json
```

**Step 2f — Interview/podcast** (type = interview):
```bash
notebooklm ask "Who are the speakers and what are their roles or backgrounds? What are the most notable quotes or claims from each speaker? Where do speakers agree or disagree?" --notebook $NOTEBOOK_ID --json
```

**Step 3 — TLDR:**
```bash
notebooklm ask "In 150 words or fewer, summarize the overall purpose and key takeaway of all the source content. Write in plain prose." --notebook $NOTEBOOK_ID --json
```

**Step 4 — Title (for single YouTube video as primary source):**
```bash
notebooklm ask "What is the exact title of this video/content?" --notebook $NOTEBOOK_ID --json
```
Skip Step 4 if the user already named the content or if multiple sources are present.

---

## Section 4: Structuring the Markdown Output

Compile the responses from Section 3 into a single markdown document:

```markdown
# {Title from source or user-provided name}

> **Sources:** {list of URLs}
> **Notebook:** {notebook name} (`{first 8 chars of notebook_id}`)
> **Date:** {YYYY-MM-DD}

{Introduction paragraph synthesized from NotebookLM's outline response}

## {Major Section Heading}

{Prose paragraph(s) synthesizing NotebookLM's answer for this section}

### {Sub-heading if warranted}

{More prose. Only use sub-headings when a section has 2+ genuinely distinct sub-topics}

...

## TLDR

{150-word max plain prose. Must address: what is this content about, the key takeaway, and who should engage with it.}
```

### Content-type sections

Based on the content type detected in Step 2a, add the matching sections after the main content sections and before TLDR. These do not count toward the 3–7 H2 limit.

**Tutorial** (type = tutorial):
```markdown
## Setup & Configuration

{Numbered setup steps, commands, prerequisites from Step 2b. Preserve exact commands, file paths, and code snippets verbatim — do not paraphrase technical instructions.}

## Tips, Tricks & Common Pitfalls

{Practical advice, warnings, and troubleshooting from Step 2b second query. Use bullet points. Preserve exact technical details.}
```

**Technical documentation** (type = technical-docs):
```markdown
## API Reference

{Key APIs, functions, parameters, configuration options from Step 2c. Use tables or definition lists for parameters. Preserve exact signatures and types.}

## Code Examples

{Usage patterns, integration snippets, compatibility notes from Step 2c. Use fenced code blocks with language tags.}
```

**Opinion/analysis** (type = opinion):
```markdown
## Key Arguments & Evidence

{Author's positions with supporting evidence from Step 2d. Use a structured format: argument → evidence → limitations.}
```

**News/announcements** (type = news):
```markdown
## What Changed

{Specific changes, timeline, impact, and action items from Step 2e. Use bullet points for clarity.}
```

**Interview/podcast** (type = interview):
```markdown
## Speaker Perspectives

{Speaker backgrounds, notable quotes, areas of agreement/disagreement from Step 2f. Attribute quotes to specific speakers.}
```

### Writing rules

- Synthesize and paraphrase NotebookLM's responses — do not paste them verbatim
- **Exception:** In content-type sections, preserve exact commands, code, file paths, API signatures, quotes, and configuration values verbatim
- Third person, present tense ("The speaker argues...", "The article examines...")
- Preserve technical terms and proper nouns exactly
- 3–7 H2 sections per document (content-type sections do not count toward this limit)
- Use H3 only for genuinely distinct sub-topics within a section

---

## Section 5: Saving the File

1. **Slugify the title:** lowercase, spaces → hyphens, strip special chars, collapse multiple hyphens
2. **Filename:** `{YYYY-MM-DD}-{slug}.md`
3. **Save to:** `~/Work/NotebookLM/{notebook-slug}/`
4. Report the full saved path to the user

**Example:** "Introduction to RAG Systems" saved on 2026-03-09 →
`~/Work/NotebookLM/research-assistant/2026-03-09-introduction-to-rag-systems.md`

---

## Section 6: Doc-Coauthoring Integration

After saving, always offer:

> "Notes saved to `{path}`. Would you like me to run the doc-coauthoring workflow to refine and enhance these notes?"

If the user says yes: invoke the `doc-coauthoring` skill. Skip its Stage 1 (Context Gathering) — the notes are already self-contained. Begin at Stage 2 (Refinement & Structure), treating the saved markdown as the draft to iterate on.

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Auth failure on any command | Run `notebooklm auth check`, then `notebooklm login` |
| Source add fails | Log warning, continue with remaining sources |
| Source wait times out (exit code 2) | Log warning, proceed with sources that are ready |
| `notebooklm ask` returns empty answer | Retry once; if still empty, note the gap in the document |
| Notebook not found after `use` | Re-run `notebooklm list --json` to confirm ID, then retry |
