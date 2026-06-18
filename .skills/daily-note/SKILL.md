---
name: daily-note
description: Generate a daily note in an Obsidian vault with open Jira tasks and Slack action items pre-populated. At the end of the session, batch-review items added to the note and optionally create them as Jira tasks. Triggers on phrases like "daily note", "create my daily note", "start my day", "open today's note", or "finish daily note" / "done with daily note".
---

# Daily Note Skill

Generates a daily note in an Obsidian vault pre-populated with open Jira tasks and Slack action items. At end of session, prompts the user to optionally create any new items as Jira tasks.

## Prerequisites

- Obsidian desktop app must be running (the CLI requires it)
- Slack MCP plugin must be enabled in `~/.claude/settings.json` — `"slack@claude-plugins-official": true`
- If Slack MCP is not available/authenticated, the skill gracefully skips that section
- Jira project key, vault name, and daily notes folder must be known (ask the user if not clear from context)

## Skill Invocation

Triggers on: "daily note", "create my daily note", "start my day", "open today's note"

End-of-session triggers: "done", "finish daily note", "done with daily note", "end session"

---

## Workflow

### Phase 0 — Resolve Context

Run once at the start of each session before any other steps.

1. Call `mcp__claude_ai_Atlassian__getAccessibleAtlassianResources` to get the Jira cloud ID. Store as `<CLOUD_ID>`.
2. Call `mcp__claude_ai_Atlassian__atlassianUserInfo` to get the current user's account ID. Store as `<ACCOUNT_ID>`.
3. Confirm the Jira project key with the user if not already known from context. Store as `<PROJECT_KEY>`.
4. Confirm the Obsidian vault name and daily notes folder if not already known. Defaults: vault = `TheBible`, folder = `1 - Rough Notes/`.

---

### Phase 1 — Fetch Jira Tasks

Run a JQL search for all open tasks assigned to the current user in the configured project:

```
project = <PROJECT_KEY> AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC
```

Use: `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql`
- `cloudId`: `<CLOUD_ID>` (from Phase 0)
- `jql`: query above
- `fields`: `summary,status,priority`

Format each result as:
```
- [ ] [<PROJECT_KEY>-123] Summary of task (In Progress)
```

If no tasks found: use `- No open tasks.`

### Phase 2 — Fetch Slack Action Items

The Slack MCP does not expose a "Later list" or "Saved items" API. The available Slack tools are for reading channels/threads and searching messages only.

**Current limitation:** Slack Later items cannot be fetched programmatically. Use this placeholder in the daily note:
```
- Slack Later list is not accessible via MCP — add items manually
```

**If a future Slack MCP version adds a later/saved items tool**, use it here and format results as:
```
- [ ] [Slack] Brief description of the item
```

Do not fail the skill — continue to Phase 3.

### Phase 3 — Build and Create the Daily Note

1. Determine today's date in format: `DD-MM-YYYY` (e.g. `<TODAY>`)

2. Read the template to get the resolved structure:
   ```bash
   obsidian template:read name="Daily Note Template - {{Date" resolve title="<TODAY>" vault=<VAULT>
   ```

3. Build the full note content by replacing the placeholder comment blocks:
   - Replace `<!-- populated by daily-note skill -->` under `## Open Jira Tasks` with the Jira checklist
   - Replace `<!-- populated by daily-note skill -->` under `## Slack Action Items` with the Slack list

4. Create the note in the daily notes folder:
   ```bash
   obsidian create name="<TODAY>" path="<DAILY_NOTES_FOLDER>/<TODAY>.md" content="<full note content>" vault=<VAULT>
   ```
   If the note already exists for today, open it without overwriting:
   ```bash
   obsidian open path="<DAILY_NOTES_FOLDER>/<TODAY>.md" vault=<VAULT>
   ```

5. Open the note in Obsidian:
   ```bash
   obsidian open path="<DAILY_NOTES_FOLDER>/<TODAY>.md" vault=<VAULT>
   ```

6. Confirm to the user:
   > Your daily note for **<TODAY>** is ready in Obsidian.
   >
   > **{N} open Jira tasks** have been pulled in.
   >
   > Add anything you want to work on or remember to the **Daily Notes** or **Items to Review for Jira** sections. When you're done, say **"done"** or **"finish daily note"** and I'll do a batch review for Jira task creation.

---

## End-of-Session Phase (triggered by "done" / "finish daily note")

### Step 1 — Read back the note

```bash
obsidian read path="<DAILY_NOTES_FOLDER>/<TODAY>.md" vault=<VAULT>
```

### Step 2 — Extract items for review

1. Parse the `## Open Jira Tasks` section of the note and extract all ticket IDs already listed (e.g. `<PROJECT_KEY>-201`). This is the **existing tickets set**.

2. Collect all bullet points or lines under `## Items to Review for Jira`.

3. Also collect any new unchecked items the user added to `## Daily Notes` that look like action items (lines starting with `- ` or `- [ ]`).

4. **Filter out duplicates:** For each candidate item, check if it contains a ticket ID that is already in the existing tickets set. If it matches, **skip it silently** — do not offer to create it as a new task.

Only items with no matching existing ticket ID proceed to Step 3.

### Step 3 — Duplicate check

For each candidate item, search Jira for an existing ticket with similar text before presenting it to the user:

```
project = <PROJECT_KEY> AND summary ~ "<key words from item text>" ORDER BY created DESC
```

Use: `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` with `maxResults=5`

- If a close match is found: show it to the user — "This looks similar to **<PROJECT_KEY>-XXX**: _Summary_. Create a new task anyway, or skip?"
- If no match found: proceed to Step 4 as normal

### Step 4 — Batch review

Present each candidate item to the user:

> **Item {N}/{total}:** "{item text}"
> Create this as a Jira task? **[Yes / No / Edit]**

- **Yes**: Create the task (Step 5)
- **No**: Skip, move to next item
- **Edit**: Ask the user for revised text, then confirm before creating

### Step 5 — Create Jira tasks

For each confirmed item, call `mcp__claude_ai_Atlassian__createJiraIssue`:
- `cloudId`: `<CLOUD_ID>` (from Phase 0)
- `projectKey`: `<PROJECT_KEY>`
- `issuetype`: `Task`
- `summary`: item text (or edited version)
- `assignee`: `<ACCOUNT_ID>` (from Phase 0)

### Step 6 — Update the note

For each created task, append the ticket link to the corresponding item in the note:

```bash
obsidian append path="<DAILY_NOTES_FOLDER>/<TODAY>.md" content="\n> Created Jira tasks: <PROJECT_KEY>-XXX, <PROJECT_KEY>-YYY" vault=<VAULT>
```

Then confirm to the user:
> Session complete. Created **{N} Jira task(s)**: <PROJECT_KEY>-XXX, <PROJECT_KEY>-YYY
> Your daily note has been updated with the ticket links.

---

## Transitioning Existing Tickets

When the end-of-session review finds items that reference existing ticket IDs (e.g. "Close DSM-201"), do not create a new task — instead offer to transition the existing ticket.

Steps:
1. Call `mcp__claude_ai_Atlassian__getTransitionsForJiraIssue` to get available transitions
2. Identify the "Done" category transition (statusCategory `key: "done"`) — typically "Delivered" or "Cancelled"
3. Call `mcp__claude_ai_Atlassian__transitionJiraIssue` with the correct payload

**Critical — correct parameter names:**

```
# Get transitions — parameter is issueIdOrKey, NOT issueKey
mcp__claude_ai_Atlassian__getTransitionsForJiraIssue:
  cloudId: <CLOUD_ID>
  issueIdOrKey: "DSM-201"   # ← must be issueIdOrKey

# Transition — transition must be an object with an id key, NOT a bare transitionId string
mcp__claude_ai_Atlassian__transitionJiraIssue:
  cloudId: <CLOUD_ID>
  issueIdOrKey: "DSM-201"
  transition:
    id: "91"               # ← must be transition: {id: "..."}, not transitionId: "91"
```

These parameter names are non-obvious and both will fail silently with a validation error if passed incorrectly.

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Obsidian not running | Inform user: "Please open the Obsidian app first, then try again." |
| Slack MCP auth error | Skip Slack section, note it in the daily note, continue |
| Jira API error | Inform user, still create the note with an empty Jira section |
| Note already exists for today | Open the existing note without overwriting |
| No items to review | Skip batch review, tell user: "No new items found to review for Jira." |
| Project key unknown | Ask the user before proceeding |
| `getTransitionsForJiraIssue` validation error | Check parameter is `issueIdOrKey`, not `issueKey` |
| `transitionJiraIssue` validation error | Check `transition` is an object `{"id": "..."}`, not a bare `transitionId` string |

---

## Key References

- **Obsidian CLI**: `/Applications/Obsidian.app/Contents/MacOS/obsidian` (available in PATH)
- **Jira cloud ID**: resolved dynamically via `mcp__claude_ai_Atlassian__getAccessibleAtlassianResources`
- **Jira account ID**: resolved dynamically via `mcp__claude_ai_Atlassian__atlassianUserInfo`
- **Jira project key**: user-configured — confirm with the user if not known from context
- **Vault name**: user-configured (default: `TheBible`)
- **Daily notes folder**: user-configured (default: `1 - Rough Notes/`)
- **Template**: `5 - Templates/Daily Note Template - {{Date.md`
- **obsidian-cli skill**: `~/work/personal/claude-code/.skills/obsidian-cli/SKILL.md`
