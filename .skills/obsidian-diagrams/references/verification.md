# Verifying diagrams

`scripts/check_diagrams.py` (Python 3.12, stdlib only) asks the running Obsidian app to parse and render each block off-screen, using the engine that actually draws the note. It then adds static Pele-portability rules. It's read-only: it never edits notes or settings, and its `eval` calls only read app state. That's why it doesn't need the "ask before eval" confirmation that ad-hoc `obsidian eval` does.

```bash
S=~/Work/.skills/obsidian-diagrams/scripts/check_diagrams.py
python3.12 $S "6 - Main Notes/My Note.md"     # vault-relative or absolute paths
python3.12 $S --source /tmp/draft.mmd          # check a draft before it goes in a note
python3.12 $S --vault                          # audit every note
python3.12 $S --engine                         # Obsidian version, engine, vault trust only
python3.12 $S NOTE --export /tmp/diagrams       # save each diagram as .svg, -light.png, -dark.png
python3.12 $S NOTE --screenshot                # also save a PNG of the note in reading view
python3.12 $S NOTE --json                      # structured output
python3.12 $S NOTE --static-only               # no Obsidian needed
```

## Reading the result

- The header line is `Obsidian <version> · engine mermaid 11.13.0`. When it says `engine pele`, Obsidian has switched: all 33 types are available and the `[pele-change]` notes no longer matter.
- **The trust banner warning:** Obsidian ≥ 1.13 asks once per vault, "Display Mermaid diagrams in this vault?". Until someone clicks **Allow**, or turns on the "Show Mermaid diagrams in notes" setting, every diagram shows as source. Tell the user. Don't click it or flip the setting for them: it's their trust decision about the vault's contents. The live check works either way.
- Each block line is `#n line L type: ok | ERROR`. L is the note line of the diagram's first line. `diagram line N` in an error counts from that first line.
- Severities:
  - `error`: fails on the live engine now. Fix it before you finish.
  - `warn`: renders, but not as written (e.g. a hex colour in a sequence `rect` is dropped).
  - `layout`: house-style breach measured on the rendered diagram: lines crossing, lines on top of each other, a line through a box, text on a line, or label text colliding with another line or box. Each comes with the edges involved (`A -> B x C -> D`).
  - `pele-break`: will fail under Pele (size limits, unknown types).
  - `pele-change`: works today, but Pele ignores or strips it.
  - `note`: advice (fixed colours, links, icons).
- Exit codes: `0` clean, `1` errors, `2` Obsidian unreachable (static rules only).

## Common errors and fixes

| Engine message (excerpt) | Cause | Fix |
|---|---|---|
| `No diagram type detected` | The keyword doesn't exist in this engine (e.g. `wardley-beta` on 11.13), or a typo | Use the fallback from `types/*.md`, or fix the keyword |
| `got 'STYLE'` / `'CLASS'` / `'CLASSDEF'` | A reserved word used as a node id or class name | Rename to a word that doesn't start with a keyword (`classDef guide …`); older renderers such as the Confluence app can trip on `styleX`/`endX` |
| `got 'end'` | `end` used as a node id | `End`, or `X[end]` |
| `got 'PS'` / `'PE'` / `'SQS'` / `'SQE'` | Brackets or parentheses inside an unquoted label | `A["Start (draft)"]` |
| `Lexical error … Unrecognized text` | A stray character (`;` mid-line, smart quotes, a tab in mindmap indentation) | Clean the line; use straight quotes |
| `Expecting token of type ':'` (architecture, packet, radar, treemap) | Newer syntax or a missing colon | Check the type reference |
| `Parse error` on a `%%{init…}%%` line | Invalid JSON (trailing comma, unquoted keys) | Use frontmatter `config:` instead |
| A sequence `box`/`rect` with no colour | A hex colour | A translucent `rgba(r,g,b,0.2)` |

## Layout checks

For graph-style diagrams the checker inserts the rendered SVG off-screen and measures it:
- **What it reads:** each line's path (`path[data-edge]`, whose id names its two endpoints), each box (`g.node`) and each label (`.edgeLabel`).
- **What it reports:** line pairs that cross, runs where two lines overlap, a line passing through a box it doesn't connect to, labels on lines, and label text that collides with another line or box.
- **Under Pele:** these measurements read mermaid.js output. Pele's SVG uses different classes (`.pele-edge`, `.pele-node`, `.pele-edge-label`), so when the engine switches, extend `layoutCheck` in the script to match them.

## Looking at a diagram

`--export DIR` is the quickest way to see a diagram.
- It renders each block off-screen with Obsidian's own engine and saves `<note>-diagramN.svg`, `-light.png` and `-dark.png` (2× scale).
- The dark PNG applies Obsidian's dark-mode filter (`invert(100%) hue-rotate(180deg) saturate(1.25)` on `#1e1e1e`), so it shows what the user actually sees in dark mode today.
- It doesn't depend on the vault trust banner and opens no tabs.
- Read the PNGs to judge overlaps, contrast and width. Use a scratch directory; exports never belong in the vault.

## Screenshots

`--screenshot` opens the note in a new tab in reading view, waits for the diagrams, saves a PNG under `$TMPDIR/obsidian-diagrams/`, closes the tab and restores the previous one.
- Read the PNG to judge legibility: overlapping labels, unreadable colours, a diagram too wide for the pane.
- While the trust banner is up, the shot shows the banner, not the diagram. Say so instead of retrying.
- Always let the script choose the path. A relative `dev:screenshot path=` writes into the vault, and Obsidian Sync would carry it to every device.

## If Obsidian isn't running

The script prints a warning and falls back to static rules (exit 2). Start the app in the background with `open -ga Obsidian`, wait a few seconds, and re-run. Don't ask the user to do it.
