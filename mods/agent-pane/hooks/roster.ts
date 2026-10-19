// Pure helpers for agent-pane's roster: the agent types you have made or run,
// from your agent definitions, the types the engine offers, and run history.
// Nothing here touches `$`, so the tests can call them directly.

import type { PaneAgent, RosterAgent } from '../types'
import { HISTORY_SIZE, MIN_SAMPLES, type Part, cutParts, median, modelColor, shortModel, shortType, typeColor } from './agents.ts'

// One agent definition file's frontmatter
export type Definition = Pick<RosterAgent, 'name' | 'description' | 'model' | 'color' | 'source'>
// One agent type as `agent.offer` saw it
export type Offer = { name: string; description: string; source: string }

// Roster lines the list view shows before folding the rest into "+N more"
export const MAX_ROSTER_ROWS = 8

function unquote(value: string): string {
  const v = value.trim()
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v
}

// Reads `name`, `description`, `model` and `color` from a definition's
// frontmatter; undefined when it has none or no name
export function parseDefinition(text: string, source: string): Definition | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return undefined
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (kv) fields.set(kv[1]!.toLowerCase(), unquote(kv[2]!))
  }
  const name = fields.get('name')
  if (!name) return undefined
  const def: Definition = { name, description: fields.get('description') ?? '', source }
  const model = fields.get('model')
  const color = fields.get('color')
  if (model) def.model = model
  if (color) def.color = color
  return def
}

// Completed runs per short type name, 'plugin:researcher' counting as 'researcher'
function runsByName(histories: ReadonlyMap<string, readonly number[]>): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const [type, runs] of histories) {
    const name = shortType(type)
    out.set(name, [...(out.get(name) ?? []), ...runs])
  }
  return out
}

// Definitions first (earlier ones win a name), then offered plugin and settings
// agents, then any built-in you have run; most-run first
export function buildRoster(
  definitions: readonly Definition[],
  offers: Iterable<Offer>,
  histories: ReadonlyMap<string, readonly number[]>,
): RosterAgent[] {
  const runs = runsByName(histories)
  const byName = new Map<string, Definition>()
  for (const def of definitions) if (!byName.has(def.name)) byName.set(def.name, def)
  for (const offer of offers) {
    const name = shortType(offer.name)
    const known = byName.get(name)
    if (known) {
      if (!known.description) byName.set(name, { ...known, description: offer.description })
    } else if (offer.source !== 'built-in' || runs.has(name)) {
      byName.set(name, { name, description: offer.description, source: offer.source })
    }
  }
  for (const name of runs.keys()) {
    if (!byName.has(name) && name !== 'teammate') byName.set(name, { name, description: '', source: 'built-in' })
  }
  return [...byName.values()]
    .map(def => {
      const done = runs.get(def.name) ?? []
      const agent: RosterAgent = { ...def, runs: done.length }
      const typical = done.length >= MIN_SAMPLES ? median(done) : undefined
      if (typical !== undefined) agent.typicalSteps = Math.round(typical)
      return agent
    })
    .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name))
}

// Gives each agent its definition's colour, so a type looks the same in the
// list, its card and the roster
export function paint(agents: readonly PaneAgent[], roster: readonly RosterAgent[]): PaneAgent[] {
  const colors = new Map(roster.flatMap(r => (r.color ? [[r.name, r.color] as const] : [])))
  return agents.map(agent => {
    const color = colors.get(shortType(agent.type))
    return color === undefined || agent.color === color ? agent : { ...agent, color }
  })
}

// History keeps the last HISTORY_SIZE runs, so a full one reads as "20+"
export function runsText(agent: Pick<RosterAgent, 'runs' | 'typicalSteps'>): string {
  if (agent.runs === 0) return 'not run yet'
  const count = agent.runs >= HISTORY_SIZE ? `${HISTORY_SIZE}+` : String(agent.runs)
  return agent.typicalSteps === undefined ? `ran ${count}×` : `ran ${count}× · ~${agent.typicalSteps} steps`
}

function width(text: string): number {
  return [...text].length
}

function pad(text: string, cells: number): string {
  const cut = width(text) > cells ? [...text].slice(0, Math.max(0, cells - 1)).join('') + '…' : text
  return cut + ' '.repeat(Math.max(0, cells - width(cut)))
}

export type RosterRow = { name: string; label: string; parts: Part[] }

// One line per roster agent: a colour swatch, its name, model and runs, with
// the ones running now marked; at most `maxRows`, the rest counted
export function rosterRows(
  roster: readonly RosterAgent[],
  runningNames: ReadonlySet<string>,
  columns: number,
  maxRows = MAX_ROSTER_ROWS,
): { rows: RosterRow[]; hidden: number } {
  const shown = roster.slice(0, Math.max(0, maxRows))
  if (shown.length === 0) return { rows: [], hidden: roster.length }
  const nameWidth = Math.min(18, Math.max(...shown.map(r => width(r.name))))
  const modelWidth = columns >= 44 ? Math.min(10, Math.max(...shown.map(r => width(shortModel(r.model))))) : 0
  const rows = shown.map(r => {
    const color = typeColor(r.name, r.color)
    const isRunning = runningNames.has(r.name)
    const parts = cutParts(
      [
        { text: ' ' },
        { text: '■', color },
        { text: ' ' },
        { text: pad(r.name, nameWidth), color, isBold: true },
        { text: ' ' },
        ...(modelWidth > 0 ? [{ text: pad(shortModel(r.model), modelWidth) + ' ', color: modelColor(r.model) }] : []),
        isRunning ? { text: '● running', color: 'claude' } : { text: runsText(r), isDim: true },
      ],
      columns,
    )
    return { name: r.name, label: parts.map(p => p.text).join(''), parts }
  })
  return { rows, hidden: roster.length - shown.length }
}
