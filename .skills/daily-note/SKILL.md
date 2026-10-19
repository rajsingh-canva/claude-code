---
name: daily-note
description: Start the user's Obsidian daily note pre-filled with their open Jira tasks (and Slack action items when available), then at the end of the day batch-review what they added and optionally create or close Jira tasks. Use when the user says "daily note", "create my daily note", "start my day" or "open today's note", and for the wrap-up when they say "finish daily note", "done with daily note" or "wrap up my day". A bare "done" or "end session" counts only when the conversation is about today's daily note. For a quick one-line capture to today's note, obsidian-cli's daily:append is enough.
---

# Daily Note

Two moments in the user's day:
- **Morning:** a daily note in Obsidian with their open Jira work already listed.
- **End of day:** a quick pass over what they jotted down, turning the real action items into Jira tasks or closing finished ones, with their approval for each.

## Before you start

- **Obsidian must be running** for the CLI parts. If a command hangs or fails, run `pgrep -x Obsidian || open -ga Obsidian`, wait a few seconds, and retry. CLI details are in the `obsidian-cli` skill.
- **Jira** comes from the Atlassian MCP tools (names like `getAccessibleAtlassianResources`, `atlassianUserInfo`, `searchJiraIssuesUsingJql`, `createJiraIssue`, `getTransitionsForJiraIssue`, `transitionJiraIssue`; look up the exact prefix in your tool list). If they're missing or unauthenticated, still create the note and say the Jira section is empty and why.
- **Slack** is optional. If no Slack tool can list saved/"Later" items, use the placeholder below and move on.
- **Defaults:** vault `TheBible` (`~/TheBible`), daily notes folder `1 - Rough Notes/`, template `5 - Templates/Daily Note Template - {{Date.md`, file name `DD-MM-YYYY.md`, Jira project **DSM** (the template's heading says `Open Jira Tasks (DSM)`). Use another key only if the user names one.

## Morning: create the note

1. **Resolve Jira context once.** Get the cloud ID and the user's account ID from the Atlassian tools.
2. **Fetch open tasks:**
   - JQL: `project = <KEY> AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`
   - Fields: `summary,status,priority`
   - Format each as `- [ ] [<KEY>-123] Summary (In Progress)`. With none, write `- No open tasks.`
3. **Slack items.** If a saved/later-items tool exists, list items as `- [ ] [Slack] …`. Otherwise use `- Slack Later list is not accessible via MCP — add items manually`.
4. **Build the note.**
   - If `1 - Rough Notes/<TODAY>.md` already exists, don't overwrite it. The user may have written in it. Open it (`obsidian open path="1 - Rough Notes/<TODAY>.md"`) and say so.
   - Otherwise:
     - get the resolved template with `obsidian template:read name="Daily Note Template - {{Date" resolve title="<TODAY>" vault=TheBible`;
     - replace the `<!-- populated by daily-note skill -->` placeholders under the `## Open Jira Tasks …` and `## Slack Action Items` headings;
     - **write the file directly** to `~/TheBible/1 - Rough Notes/<TODAY>.md`. A whole note passed through `obsidian create content=…` gets its quotes, backticks and backslashes mangled.
   - Then `obsidian open path="1 - Rough Notes/<TODAY>.md" vault=TheBible`. If the CLI says "not found" right after the write, wait a second; Obsidian's index is catching up.
5. **Tell the user** it's ready, how many Jira tasks were pulled in, and that "finish daily note" starts the end-of-day review.

## End of day: review

1. **Read the note:** `obsidian read path="1 - Rough Notes/<TODAY>.md"`, or Read the file.
2. **Collect candidates:**
   - everything under `## Items to Review for Jira`;
   - new unchecked action-like lines in `## Daily Notes`.

   Drop any candidate that mentions a ticket ID already listed in the Open Jira Tasks section. It's already tracked.
3. **Check for near-duplicates.** For each remaining item, run `project = <KEY> AND summary ~ "<key words>" ORDER BY created DESC` (max 5). If something close exists, show it: "This looks like **KEY-123**: …. Create a new task anyway, or skip?"
4. **Review one at a time:** "Item 2/5: '…' — create as a Jira task? (yes / no / edit)". Nothing goes to Jira without a yes. Creating tickets is visible to the user's team.
5. **Create the confirmed tasks** in the project with type `Task`, the item text as summary, and the user as assignee.
6. **Record the result in the note.** Append a line such as `> Created Jira tasks: KEY-301, KEY-302` with `obsidian-cli`'s `vault_note.py append "1 - Rough Notes/<TODAY>.md"`, or an Edit. `obsidian append` would add a stray blank line. Then summarise for the user.

**Items that reference an existing ticket** ("close DSM-201") are transitions, not new tasks. Offer to move the ticket: fetch its transitions, pick the one whose status category is `done` (often "Delivered" or "Cancelled"), confirm, and apply it.

These two Atlassian calls fail with a validation error if the parameters are shaped wrong, and the names aren't obvious:
```
getTransitionsForJiraIssue:  cloudId, issueIdOrKey: "DSM-201"            # issueIdOrKey, not issueKey
transitionJiraIssue:         cloudId, issueIdOrKey: "DSM-201",
                             transition: { id: "91" }                    # an object with id, not transitionId: "91"
```

## When things go wrong

| Situation | Do |
|---|---|
| Obsidian not running | `open -ga Obsidian`, wait, and retry. Only ask the user if it still won't start |
| Jira tools missing or erroring | Create the note anyway, leave the Jira section empty, explain why |
| Slack unavailable | Use the placeholder line, continue |
| Today's note already exists | Open it; never overwrite |
| Nothing to review | "No new items found to review for Jira." |
| User works in another project | Ask once, then reuse it for the session |
