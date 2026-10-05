// Pure helpers for agent-progress. Nothing here touches `$`, so the hooks
// module can import them and the tests can call them directly.

export type AgentRow = {
  id: string
  type: string
  description: string
  startedAt: number
  finishedAt?: number
  steps: number
  isDone: boolean
}

export type Line = { text: string; isDim?: boolean }

// Expected model requests for an agent type with too little history
export const DEFAULT_STEPS = 15
// Completed runs needed before the median replaces the default
export const MIN_SAMPLES = 3
// Completed runs kept per agent type
export const HISTORY_SIZE = 20
// A running agent never shows more than this, so an estimate never reads as done
export const RUNNING_CAP = 95
// Up to this many agents get a bar each; more collapse into a summary
export const MAX_BAR_ROWS = 4

const SEP = ' · '

export function median(nums: readonly number[]): number | undefined {
  if (nums.length === 0) return undefined
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function expectedSteps(history: readonly number[] = []): number {
  const typical = history.length >= MIN_SAMPLES ? median(history) : undefined
  return Math.max(1, typical ?? DEFAULT_STEPS)
}

export function estimatePercent(agent: Pick<AgentRow, 'steps' | 'isDone'>, history?: readonly number[]): number {
  if (agent.isDone) return 100
  return Math.min(RUNNING_CAP, Math.round((agent.steps / expectedSteps(history)) * 100))
}

export function pushHistory(history: readonly number[] = [], steps: number): number[] {
  return [...history, steps].slice(-HISTORY_SIZE)
}

export function bar(pct: number, width: number): string {
  const cells = Math.max(1, Math.floor(width))
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function width(text: string): number {
  return [...text].length
}

export function truncate(text: string, cells: number): string {
  if (cells <= 0) return ''
  if (width(text) <= cells) return text
  return [...text].slice(0, cells - 1).join('') + '…'
}

function pad(text: string, cells: number): string {
  const cut = truncate(text, cells)
  return cut + ' '.repeat(Math.max(0, cells - width(cut)))
}

// 'superpowers:code-reviewer' reads as 'code-reviewer', 'general-purpose' as 'general'
export function shortType(type: string): string {
  const base = type.slice(type.lastIndexOf(':') + 1)
  return base === 'general-purpose' ? 'general' : base
}

function barWidth(columns: number): number {
  return Math.max(6, Math.min(20, Math.floor(columns / 4)))
}

function barRows(agents: readonly AgentRow[], pcts: readonly number[], now: number, columns: number): Line[] {
  const typeWidth = Math.min(12, Math.max(...agents.map(a => width(shortType(a.type)))))
  let cells = barWidth(columns)
  // type, bar, a 4-cell percentage, a 5-cell clock and the spaces between them
  let descWidth = columns - (typeWidth + cells + 13)
  if (descWidth < 6) {
    descWidth = 0
    cells = Math.max(3, columns - (typeWidth + 12))
  }
  return agents.map((agent, i) => {
    const pct = agent.isDone ? 'done' : `~${pcts[i]}%`.padStart(4)
    const clock = formatElapsed((agent.finishedAt ?? now) - agent.startedAt).padStart(5)
    const desc = descWidth > 0 ? ' ' + pad(agent.description, descWidth) : ''
    const text = `${pad(shortType(agent.type), typeWidth)}${desc} ${bar(pcts[i]!, cells)} ${pct} ${clock}`
    return { text: truncate(text, columns), isDim: agent.isDone }
  })
}

function wrapChips(chips: readonly string[], columns: number, maxLines: number): string[] {
  if (maxLines <= 0) return []
  const rows: string[][] = []
  for (const chip of chips) {
    const row = rows[rows.length - 1]
    if (row && width([...row, chip].join(SEP)) <= columns) row.push(chip)
    else rows.push([chip])
  }
  if (rows.length > maxLines) {
    const last = rows[maxLines - 1]!
    let hidden = rows.slice(maxLines).reduce((n, row) => n + row.length, 0)
    while (last.length > 1 && width([...last, `+${hidden} more`].join(SEP)) > columns) {
      last.pop()
      hidden += 1
    }
    last.push(`+${hidden} more`)
    rows.length = maxLines
  }
  return rows.map(row => truncate(row.join(SEP), columns))
}

function summary(agents: readonly AgentRow[], pcts: readonly number[], columns: number, maxRows: number): Line[] {
  const done = agents.filter(a => a.isDone).length
  const overall = Math.round(pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length)
  const head = `${agents.length} agents · ${done} done  ${bar(overall, barWidth(columns))}  ${overall}%`
  const order = agents.map((agent, i) => ({ agent, pct: pcts[i]! }))
  const running = order.filter(o => !o.agent.isDone).sort((a, b) => b.pct - a.pct)
  const chips = [
    ...running.map(o => `${shortType(o.agent.type)} ~${o.pct}%`),
    ...order.filter(o => o.agent.isDone).map(() => '✓'),
  ]
  return [
    { text: truncate(head, columns) },
    ...wrapChips(chips, columns, Math.max(0, maxRows - 1)).map(text => ({ text, isDim: true })),
  ]
}

// The band's lines: a bar per agent for a few, a summary with chips for many
export function layout(
  agents: readonly AgentRow[],
  histories: ReadonlyMap<string, readonly number[]>,
  now: number,
  columns: number,
  maxRows: number,
): Line[] {
  if (agents.length === 0) return []
  const pcts = agents.map(agent => estimatePercent(agent, histories.get(agent.type)))
  if (agents.length <= MAX_BAR_ROWS && agents.length <= maxRows) return barRows(agents, pcts, now, columns)
  return summary(agents, pcts, columns, maxRows)
}
