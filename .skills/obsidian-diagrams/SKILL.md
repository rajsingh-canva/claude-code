---
name: obsidian-diagrams
description: Create, style, fix and check diagrams in Obsidian notes — Mermaid code blocks drawn by Obsidian's bundled mermaid.js today and by its new Pele renderer next. Use whenever the user wants a diagram or chart in a note (flowchart, sequence, class/state/ER, Gantt, timeline, mindmap, git graph, kanban, journey, architecture/C4/block, pie/xy/quadrant/sankey/radar/treemap/venn charts, fishbone/ishikawa, Wardley map, Cynefin, railroad, tree view, swimlane, event modeling, use case, agentflow), wants diagrams themed for light/dark, coloured or given a hand-drawn look, has a diagram that won't render, or asks whether vault diagrams will survive the move to Pele — even if they only say "visualise", "map out" or "draw" about a note. Not for Excalidraw or .canvas files.
---

# Obsidian Diagrams

Diagrams in Obsidian are fenced ` ```mermaid ` blocks. The syntax is staying, but the engine that draws it is changing:

- **Today:** Obsidian 1.14.x draws them with bundled **mermaid.js 11.13.0**.
- **Next:** **Pele** (`obsidianmd/pele`, docs at pele.run) is Obsidian's new renderer for the *same* Mermaid syntax. It targets Mermaid 12.1, has its own faster layout engine, and is themed with `--pele-*` CSS variables. It isn't in Obsidian yet.

So the job is always: **write Mermaid that the live engine accepts, and that keeps working after the switch.** `scripts/check_diagrams.py` tells you which engine is live and checks blocks against it exactly. Lean on it instead of on memory.

## Three Obsidian facts that catch people out

1. **Vault trust banner.** Since 1.13, Obsidian asks once per vault: "Display Mermaid diagrams in this vault? … Allow". Until the user clicks Allow (or turns on the "Show Mermaid diagrams in notes" setting; search "Mermaid" in Settings), every diagram shows as source. The checker reports this. Tell the user, and leave the decision to them: it's a trust choice about the vault's contents, so don't click it or flip the setting yourself.
2. **Dark mode is an invert filter.** Obsidian draws Mermaid in its light theme, and in dark mode it inverts the whole SVG (invert + hue-rotate). Light fills with dark text come out as dark fills with light text, and exact brand colours shift. Pele doesn't invert; it uses CSS variables. Details: `references/styling.md` §1.
3. **`[[…]]` inside a diagram is a shape, not a wikilink.** To link nodes to notes, use `class A,B internal-link;`. The node's *label* is the note name.

## Workflow

1. **Decide what to draw.** Pick the type from the routing table below by the *shape of the content*, not by what's fashionable. If a table or list says it more clearly, say so and offer that instead. A diagram nobody can read is worse than none.
2. **Know the engine.** Run `python3.12 scripts/check_diagrams.py --engine` once per session, or use the header from any earlier check.
   - On **mermaid 11.13**, use only the types marked ✓ and avoid the newer syntax noted in each type reference.
   - On **pele**, every type below is available.
3. **Draft the block.** For the type, read the matching `references/types/*.md` section: version limits, pitfalls, and examples for the unusual types. You already know the common syntax; the reference holds what you can't know: what this Obsidian accepts.
4. **Put it in the note.**
   - Edit the file directly with Write/Edit at `<vault>/<path>.md`. The vault is plain files. CLI `content=` arguments mangle backticks, quotes and newlines, so never pass a diagram through them.
   - Inside a callout, prefix every line, the fences included, with `> `.
   - Add one plain-sentence summary next to the diagram ("Approval flow: Workato raises a Jira ticket, Slack notifies approvers…"). Search, backlinks and future readers can't see inside diagram source.
   - For accessibility, add `accTitle: …` / `accDescr: …` as the first lines inside the block. Both engines support them.
   - Change only the block you were asked about; leave the rest of the note byte-for-byte alone.
5. **Check it.** `python3.12 scripts/check_diagrams.py "<note path>"`. Fix every `error` and `layout` finding (house style, below), and read `warn` and `pele-change` lines and act where it matters. Re-run until clean. After about three failed rounds, simplify the diagram or switch to the fallback type, and say what happened. If legibility matters (dense diagrams, colours, a hand-drawn look), add `--export <scratch dir>` and Read the PNGs. You get `-light.png` and `-dark.png` per diagram, rendered by Obsidian's own engine, with dark emulating Obsidian's invert filter, and it works even while the trust banner is up. `--screenshot` shows the real note page but only once diagrams are allowed. Keep exports outside the vault.
6. **Report briefly.** Say what you added and where, any engine caveat (Pele-only type, a look that disappears under Pele, the trust banner), and anything you chose not to do.

## Routing table

✓ = renders on Obsidian's mermaid 11.13 today. ✗ = Pele / Mermaid ≥ 11.14 only (use the fallback today).

| Content shape | Type (keyword) | Today | Reference |
|---|---|---|---|
| Steps, decisions, process | `flowchart TD/LR` | ✓ | types/flow.md |
| Process across teams or lanes | `swimlane-beta` | ✗ → flowchart + subgraphs | types/flow.md |
| Agent or tool pipeline | `agentflow-beta` | ✗ → flowchart | types/flow.md |
| Hand-placed grid of parts | `block-beta` | ✓ | types/flow.md |
| Messages between systems over time | `sequenceDiagram` | ✓ | types/interaction.md |
| Lifecycle or states | `stateDiagram-v2` | ✓ | types/interaction.md |
| User experience score by step | `journey` | ✓ | types/interaction.md |
| Actors and use cases | `usecase-beta` | ✗ → flowchart | types/interaction.md |
| Event-sourced workflow | `eventmodeling` | ✗ → flowchart LR lanes | types/interaction.md |
| Classes, interfaces | `classDiagram` | ✓ | types/structure.md |
| Data model | `erDiagram` | ✓ | types/structure.md |
| Requirements traceability | `requirementDiagram` | ✓ | types/structure.md |
| System context or containers | `C4Context` … | ✓ | types/structure.md |
| Cloud or service topology | `architecture-beta` | ✓ | types/structure.md |
| Protocol header or bit layout | `packet-beta` | ✓ | types/structure.md |
| File or folder tree | `treeView-beta` | ✗ → ` ```text ` tree | types/structure.md |
| Schedule with dependencies | `gantt` | ✓ | types/planning.md |
| Events by period | `timeline` | ✓ | types/planning.md |
| Work board | `kanban` | ✓ | types/planning.md |
| Branching history | `gitGraph` | ✓ | types/planning.md |
| Parts of a whole | `pie` | ✓ | types/charts.md |
| Values over categories | `xychart` | ✓ | types/charts.md |
| 2×2 prioritisation | `quadrantChart` | ✓ | types/charts.md |
| Flows and volumes | `sankey` | ✓ | types/charts.md |
| Multi-axis comparison | `radar-beta` | ✓ | types/charts.md |
| Hierarchical sizes | `treemap-beta` | ✓ | types/charts.md |
| Overlapping sets | `venn-beta` | ✓ | types/charts.md |
| Topic breakdown | `mindmap` | ✓ | types/thinking.md |
| Causes of a problem (fishbone) | `ishikawa-beta` | ✓ | types/thinking.md |
| Situation or decision domains | `cynefin-beta` | ✗ → quadrantChart | types/thinking.md |
| Value chain vs evolution | `wardley-beta` | ✗ → quadrantChart (+flowchart) | types/thinking.md |
| Grammar or syntax rules | `railroad-*-beta` | ✗ → ` ```ebnf ` block | types/thinking.md |

**When the user asks for a ✗ type while mermaid is live,** don't silently write a block that shows as an error.
- If they need it visible now (or say it must work on their phone), build the fallback and mention that the native type arrives with Pele.
- If they're happy to wait, write the native block and say it will show as an error until Obsidian ships Pele.
- If you can't tell which they'd want, ask. This is a real choice, not a formality.

## Portable by default

These keep a diagram working on mermaid.js today and on Pele later:

- Stick to the type's ✓ syntax. Each type reference lists the newer syntax that breaks on 11.13.
- **Labels:** quote any label containing brackets, parentheses, `#`, `;` or quotes (`A["Start (draft)"]`). Use `<br>` for line breaks and `<b>`/`<i>` for emphasis; Pele strips every other HTML tag.
- **Reserved words** (`end`, `style`, `class`, `classDef`, `linkStyle`, `click`, `subgraph`) are never node ids or class names.
- **Links:** use `internal-link` for notes and `click X href "https://…"` for URLs. JS callbacks never run.
- **Inline styles:** keep to the Pele allow-list: fill, stroke*, opacity, rx/ry, color, font-*, text-decoration, letter/word-spacing.
- **Sequence colours:** `box`/`rect` take `rgba()` or `hsla()`, never hex (silently dropped). Keep them translucent (alpha 0.15–0.3). Message text can't be coloured and follows the theme, so an opaque light tint becomes light-on-light under Pele's dark mode.
- **Size:** stay well under ~30 nodes per diagram; split and link if bigger. Pele hard-rejects anything over 50,000 characters or 5,000 edges.

## House style: clean lines

The user wants diagrams where **no lines cross or overlap, no line runs through a box, and no text sits on a line**. The checker measures all of this on the rendered diagram and reports it as `[layout]` findings, so treat them like errors: fix, re-check, and only hand back a diagram that passes. This applies to graph-style diagrams (flowchart, state, class, ER, block, architecture). In a sequence diagram the message text *is* the line label, so it's exempt.

**Keeping text off lines.** Put the words in the boxes:
- **Relationship words** become a second line in the target box: `C["COCOP<br><i>app install</i>"]`, not `A -->|app install| C`.
- **Decision outcomes** start the next box: `Q{Approved?} --> Y([Yes: provision device])`, not `Q -->|yes| P[Provision device]`.
- If a line needs its own words, it should probably be a box.

**Keeping lines apart.** The layout engine (dagre today) places boxes in ranks, in roughly the order you declare them, and routes lines between them. You steer it with structure:
1. Pick the `direction` that matches the main flow, and declare nodes and edges in flow order, happy path first.
2. Replace many-to-many links with a hub or merge box. Three sources each linked to three targets will always cross; three sources into one hub, then out to three targets, never does.
3. Avoid lines that skip ranks (`A --> D` past `B` and `C`). They detour through other boxes. Route through the intermediate box, or reorder.
4. Avoid back-edges (cycles) unless the loop is the point. Show one loop at most.
5. Group with subgraphs, and link group-to-group rather than threading lines between members.
6. If a layout still crosses after two or three reorderings, split it into two linked diagrams or use a table. Many-to-many relationships are tables, not diagrams.

Re-check after the switch to Pele: it has its own layout engine, so a clean dagre layout can change.

## Styling, quickly

Full guide: `references/styling.md`.
- **"Match my theme" / "work in light and dark"** → for new diagrams, no colours at all; both engines follow the theme on their own. Existing colour coding that already uses light fills with dark `color:` reads in both modes, so keep it unless the user asks to drop it. Removing colours someone chose loses meaning. Never set `theme: dark`.
- **Colour by meaning** → `classDef` with a light fill, mid stroke and dark `color:` (the palette in styling.md §5, which matches the user's existing diagrams). It reads in light mode, in today's inverted dark mode, and under Pele.
- **One diagram's palette** → frontmatter `config: theme: base` + `themeVariables`. Today only; Pele ignores it.
- **Vault-wide, Pele era** → `assets/pele-theme.css` as a snippet in `.obsidian/snippets/`. It does nothing until Pele ships. Writing the file on request is fine; confirm before enabling it with `obsidian snippet:enable`, since it changes every note.

## Looks and layout, quickly

Full guide: `references/looks-and-layout.md`.
- `look: handDrawn` (add `handDrawnSeed: <n>` for stable sketches) and `look: neo` work today on flowcharts and state diagrams. Pele ignores both, so mention that the look disappears after the switch.
- `layout: elk` does nothing in Obsidian (no ELK bundled). Don't offer it.
- Direction, curves (`flowchart.curve`), spacing and `useMaxWidth` work on both engines. Under Pele, wide `LR` diagrams may flip to top-down on narrow screens.

## Auditing a vault or a note

`python3.12 scripts/check_diagrams.py --vault` produces a report covering:
- what fails today;
- what renders but not as written;
- what changes or breaks under Pele;
- fixed-colour notes.

Present the findings grouped by cause, not note by note. Offer fixes, and **don't bulk-edit notes without the user's go-ahead**. When fixing, change only the broken lines.

## Files

- `scripts/check_diagrams.py`: live check, audit, image export and screenshots (`--help`). Needs the Obsidian app running; otherwise it falls back to static rules. Start Obsidian with `open -ga Obsidian` rather than asking the user.
- `references/types/{flow,interaction,structure,planning,charts,thinking}.md`: per-type limits, pitfalls, examples and fallbacks.
- `references/styling.md`, `references/looks-and-layout.md`, `references/verification.md`.
- `assets/pele-theme.css`: Obsidian snippet mapping `--pele-*` onto the theme.

Related skills: `obsidian-cli` (search, open, properties, snippets), `obsidian-zettelkasten` (what goes in a note).
