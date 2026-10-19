# Planning types: gantt, timeline, kanban, git graph

Facts as of Pele 1.6.0 / Mermaid 12.1 / Obsidian 1.14.4 (mermaid 11.13), checked 2026-10-19.

## gantt: renders today ✓

- Basics: `dateFormat YYYY-MM-DD`, `axisFormat %d %b`, `excludes weekends`, `section`, and tasks `Name :tag, id, start, duration|end`.
- **Tags:** `crit` (Pele colours it `--pele-critical`), `active`, `done`, `milestone`. Dependencies: `after id`.
- **Breaks today:** more than one `excludes`/`includes` line (Mermaid 11.16+). Put everything on one line.
- `todayMarker off` or `todayMarker stroke:#…` controls the today line. `click id href "https://…"` adds links.
- **Config both engines read:** `gantt.barHeight`, `barGap`, `topAxis`, `axisFormat`, `tickInterval`, `weekday`, `displayMode: compact`.

```mermaid
gantt
  title Device refresh
  dateFormat YYYY-MM-DD
  excludes weekends
  section Prep
    Order hardware   :done, a1, 2026-11-02, 5d
    Image build      :active, a2, after a1, 4d
  section Rollout
    Pilot group      :crit, b1, after a2, 3d
    Go-live          :milestone, m1, after b1, 0d
```

## timeline: renders today ✓

- Structure: `title`, `section`, and `Period : event : event`. Line breaks use `<br>`.
- A direction after the keyword (`timeline LR`) is Mermaid 11.14+. On 11.13 it parses but is ignored.
- `timeline.disableMulticolor: true` makes all sections one colour.
- No inline styling.

## kanban: renders today ✓

```mermaid
kanban
  todo[To do]
    t1[Update DB function]@{ ticket: DSM-201, assigned: 'raj', priority: 'High' }
  doing[In progress]
    t2[Write runbook]
  done[Done]
    t3[Order laptops]
```
- Indentation defines columns and cards.
- Metadata goes in `@{ ticket, assigned, priority }`. `config: kanban: ticketBaseUrl: 'https://…/#TICKET#'` links the tickets.
- `:::class` has no visible effect without CSS.

## gitGraph: renders today ✓

- Commands: `commit id: "x" tag: "v1"`, `branch name`, `checkout name`, `merge name`, `cherry-pick id: "x"`.
- Config: `gitGraph.mainBranchName`, `showBranches`, `showCommitLabel`, `rotateCommitLabel`, `parallelCommits`.
- Branch colours come from the theme (Pele: `--pele-series-*`).
