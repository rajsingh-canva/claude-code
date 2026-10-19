// Pure helpers for agent-pane. Nothing here touches `$`, so the hooks
// module can import them and the tests can call them directly.

import type { AgentInfo, SessionMessage } from 'claude-code'

import type { PaneAgent } from '../types'

export type Status = PaneAgent['status']
export type Line = { text: string; isDim?: boolean; isUser?: boolean }
// One run of a row in one colour; a row's parts joined are its label
export type Part = { text: string; color?: string; isBold?: boolean; isDim?: boolean }
export type Row = { id: string; label: string; parts: Part[]; isDim: boolean }

// Expected model requests for an agent type with too little history
export const DEFAULT_STEPS = 15
// Completed runs needed before the median replaces the default
export const MIN_SAMPLES = 3
// Completed runs kept per agent type
export const HISTORY_SIZE = 20
// A running agent never shows more than this, so an estimate never reads as done
export const RUNNING_CAP = 95
// Agents the pane keeps, finished ones included, so they can still be opened
export const MAX_AGENTS = 50
// An agent missing from $.agent.list() this soon after it started may just not be listed yet
export const VANISH_GRACE_MS = 3000

const ACTIVE: ReadonlySet<Status> = new Set(['pending', 'running', 'waiting'])

const GLYPH: Record<Status, string> = {
  pending: '○',
  running: '●',
  waiting: '◐',
  idle: '◇',
  completed: '✓',
  failed: '✗',
  killed: '■',
}

const WORD: Record<Status, string> = {
  pending: 'queued',
  running: 'running',
  waiting: 'waiting',
  idle: 'idle',
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
}

// Theme keys, so a status follows the person's theme
const STATUS_COLOR: Record<Status, string> = {
  pending: 'inactive',
  running: 'claude',
  waiting: 'warning',
  idle: 'subtle',
  completed: 'success',
  failed: 'error',
  killed: 'inactive',
}

// Agent colours that read on light and dark backgrounds; a type hashes to one
export const PALETTE = ['#e07a5f', '#3d9be9', '#81b29a', '#f2a541', '#b07cc6', '#4ecdc4', '#e5698e', '#9aa84f']

// The names an agent definition's `color:` frontmatter takes
const NAMED_COLOR: Record<string, string> = {
  red: '#e06c75',
  orange: '#e5a050',
  yellow: '#e5c07b',
  green: '#81b29a',
  cyan: '#4ecdc4',
  blue: '#3d9be9',
  purple: '#b07cc6',
  pink: '#e5698e',
}

// A sprite is three lines five cells wide: a top and a body picked by the
// agent's type, so each type always looks the same, and a face that shows its status
const SPRITE_TOPS = [' ╷ ╷ ', '  ┃  ', ' ╲ ╱ ', ' ◠ ◠ ', '  ●  ', ' ▴ ▴ ']
const SPRITE_BODIES = [' /█\\ ', ' ╰┬╯ ', ' ▐█▌ ', ' /▓\\ ', ' ╘═╛ ', ' ▀█▀ ']
// Each status's frames; a running agent blinks, an idle one dozes
const FACES: Record<Status, readonly string[]> = {
  pending: ['(·_·)'],
  running: ['(•‿•)', '(•‿•)', '(-‿-)'],
  waiting: ['(°_°)', '(°_°)', '(°_-)'],
  idle: ['(-_-)', '(-.-)'],
  completed: ['(^‿^)'],
  failed: ['(×_×)'],
  killed: ['(-_-)'],
}

// Input fields that best name what a tool call was about, in order of preference
const ARG_KEYS = ['file_path', 'command', 'pattern', 'path', 'url', 'query', 'description', 'prompt']

export function isActive(agent: Pick<PaneAgent, 'status'>): boolean {
  return ACTIVE.has(agent.status)
}

export function glyph(status: Status): string {
  return GLYPH[status]
}

export function statusWord(status: Status): string {
  return WORD[status]
}

export function statusColor(status: Status): string {
  return STATUS_COLOR[status]
}

function hash(text: string): number {
  let h = 5381
  for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0
  return h
}

// An agent type's colour: its definition's `color:` when it names one, else
// the same palette entry every time for that type
export function typeColor(type: string, named?: string): string {
  const key = named?.trim().toLowerCase()
  if (key) return NAMED_COLOR[key] ?? key
  return PALETTE[hash(shortType(type)) % PALETTE.length]!
}

// 'claude-sonnet-5-5' reads as 'sonnet 5.5', 'claude-haiku-4-5-20251001' as 'haiku 4.5'
export function shortModel(model: string | undefined): string {
  if (!model) return ''
  const bare = model.replace(/\[.*\]$/, '').replace(/^.*\//, '')
  const named = /claude-([a-z]+)-(\d+)(?:-(\d))?(?:-\d{8})?$/.exec(bare)
  if (named) return named[3] === undefined ? `${named[1]} ${named[2]}` : `${named[1]} ${named[2]}.${named[3]}`
  return ['fable', 'opus', 'sonnet', 'haiku'].find(family => bare.includes(family)) ?? bare
}

// A model family's colour, so a glance tells which tier each agent runs on
export function modelColor(model: string | undefined): string {
  const name = model ?? ''
  if (name.includes('opus')) return '#b07cc6'
  if (name.includes('sonnet')) return '#3d9be9'
  if (name.includes('haiku')) return '#81b29a'
  if (name.includes('fable')) return '#e5a050'
  return 'subtle'
}

// 950 → '950', 12_400 → '12.4k', 1_250_000 → '1.3M'
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// The agent's three-line sprite at `now`, one frame a second
export function sprite(type: string, status: Status, now: number): string[] {
  const h = hash(shortType(type))
  const frames = FACES[status]
  const face = frames[Math.floor(now / 1000) % frames.length]!
  return [SPRITE_TOPS[h % SPRITE_TOPS.length]!, face, SPRITE_BODIES[Math.floor(h / SPRITE_TOPS.length) % SPRITE_BODIES.length]!]
}

// Keeps the first `cells` cells of a row's parts, ending in … when it cuts
export function cutParts(parts: readonly Part[], cells: number): Part[] {
  const total = parts.reduce((n, part) => n + width(part.text), 0)
  if (total <= cells) return [...parts]
  const out: Part[] = []
  let room = cells
  for (const part of parts) {
    if (room <= 0) break
    const w = width(part.text)
    if (w < room) {
      out.push(part)
      room -= w
      continue
    }
    out.push({ ...part, text: truncate(part.text, room) })
    break
  }
  return out
}

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

export function estimatePercent(agent: Pick<PaneAgent, 'steps' | 'status'>, history?: readonly number[]): number {
  if (agent.status === 'completed') return 100
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

// A teammate goes by its name, a subagent by its type
export function who(agent: Pick<PaneAgent, 'type' | 'name' | 'isTeammate'>): string {
  return agent.isTeammate ? (agent.name ?? 'teammate') : shortType(agent.type)
}

function isTeammate(info: Pick<AgentInfo, 'type' | 'teammateId'>): boolean {
  return info.type === 'teammate' || info.teammateId !== undefined
}

function ended(agent: PaneAgent, status: Status, now: number): PaneAgent {
  return { ...agent, status, finishedAt: agent.finishedAt ?? now }
}

// A finished agent that runs again (a message resumed it) starts a fresh run
function resumed(agent: PaneAgent, status: Status, now: number): PaneAgent {
  const { finishedAt: _, ...rest } = agent
  return isActive(agent) ? { ...rest, status } : { ...rest, status, startedAt: now, steps: 0, outputTokens: 0 }
}

export function withStatus(agent: PaneAgent, status: Status, now: number): PaneAgent {
  return ACTIVE.has(status) ? resumed(agent, status, now) : ended(agent, status, now)
}

export function fromInfo(info: AgentInfo, now: number): PaneAgent {
  const agent: PaneAgent = {
    id: info.id,
    type: info.type,
    description: info.description,
    status: info.status,
    isTeammate: isTeammate(info),
    startedAt: now,
    steps: 0,
  }
  if (info.name !== undefined) agent.name = info.name
  return ACTIVE.has(info.status) ? agent : { ...agent, finishedAt: now }
}

// Reconciles the pane's agents with $.agent.list(): adds ones it never saw spawn,
// takes each listed agent's status, and ends running ones the engine dropped
export function merge(agents: readonly PaneAgent[], listed: readonly AgentInfo[], now: number): PaneAgent[] {
  const live = new Map(listed.map(info => [info.id, info]))
  const known = new Set(agents.map(agent => agent.id))
  const next = agents.map(agent => {
    const info = live.get(agent.id)
    if (info === undefined) {
      const hasVanished = isActive(agent) && now - agent.startedAt > VANISH_GRACE_MS
      return hasVanished ? ended(agent, 'completed', now) : agent
    }
    const updated = { ...agent, description: info.description || agent.description }
    if (info.name !== undefined) updated.name = info.name
    return updated.status === info.status ? updated : withStatus(updated, info.status, now)
  })
  for (const info of listed) {
    if (!known.has(info.id)) next.push(fromInfo(info, now))
  }
  return next.slice(-MAX_AGENTS)
}

// Running agents first, then the most recently started
export function ordered(agents: readonly PaneAgent[]): PaneAgent[] {
  return [...agents].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.startedAt - a.startedAt)
}

function progressParts(agent: PaneAgent, pct: number, barCells: number, color: string): Part[] {
  if (agent.status !== 'running') return [{ text: statusWord(agent.status), color: statusColor(agent.status) }]
  const label = { text: `~${pct}%`, color: 'subtle' }
  return barCells > 0 ? [{ text: bar(pct, barCells), color }, { text: ' ' }, label] : [label]
}

// One clickable line per agent: mark, glyph, who, task, progress and clock,
// the task cut to whatever room the rest leaves; status and type each have a colour
export function rows(
  agents: readonly PaneAgent[],
  histories: ReadonlyMap<string, readonly number[]>,
  now: number,
  columns: number,
  viewedId?: string,
): Row[] {
  const list = ordered(agents)
  if (list.length === 0) return []
  const whoWidth = Math.min(14, Math.max(...list.map(agent => width(who(agent)))))
  const barCells = columns >= 56 ? 8 : 0
  const modelWidth = columns >= 48 ? Math.min(10, Math.max(...list.map(agent => width(shortModel(agent.model))))) : 0
  const tails = list.map(agent => {
    const pct = estimatePercent(agent, histories.get(agent.type))
    const clock = formatElapsed((agent.finishedAt ?? now) - agent.startedAt)
    return [...progressParts(agent, pct, barCells, typeColor(agent.type)), { text: ' ' + clock.padStart(5), color: 'inactive' }]
  })
  const tailWidth = Math.max(...tails.map(tail => width(tail.map(p => p.text).join(''))))
  return list.map((agent, i) => {
    const color = typeColor(agent.type)
    const isViewed = agent.id === viewedId
    const head: Part[] = [
      { text: isViewed ? '▸' : ' ', color: 'claude' },
      { text: glyph(agent.status), color: statusColor(agent.status) },
      { text: ' ' },
      { text: pad(who(agent), whoWidth), color, isBold: true },
      { text: ' ' },
      ...(modelWidth > 0 ? [{ text: pad(shortModel(agent.model), modelWidth) + ' ', color: modelColor(agent.model) }] : []),
    ]
    const headWidth = width(head.map(p => p.text).join(''))
    const descWidth = columns - headWidth - tailWidth - 1
    const desc: Part[] = descWidth >= 4 ? [{ text: pad(agent.description, descWidth) + ' ', isDim: true }] : []
    const tail = tails[i]!
    const gap = tailWidth - width(tail.map(p => p.text).join(''))
    const parts = cutParts([...head, ...desc, ...(gap > 0 ? [{ text: ' '.repeat(gap) }] : []), ...tail], columns)
    return { id: agent.id, label: parts.map(p => p.text).join(''), parts, isDim: !isActive(agent) }
  })
}

// The open agent's one-line summary under its name
export function summary(agent: PaneAgent, history: readonly number[] | undefined, now: number): string {
  const clock = formatElapsed((agent.finishedAt ?? now) - agent.startedAt)
  const parts = [statusWord(agent.status), clock]
  if (agent.status === 'running') parts.push(`~${estimatePercent(agent, history)}%`)
  parts.push(`${agent.steps} request${agent.steps === 1 ? '' : 's'}`)
  if (agent.outputTokens) parts.push(`${formatTokens(agent.outputTokens)} out`)
  return parts.join(' · ')
}

// The open agent's progress bar and what it stands for
export function progressLine(agent: PaneAgent, history: readonly number[] | undefined, cells: number): string {
  const pct = estimatePercent(agent, history)
  if (agent.status === 'running') return `${bar(pct, cells)} ~${pct}%`
  return `${bar(agent.status === 'completed' ? 100 : pct, cells)} ${statusWord(agent.status)}`
}

// The open agent's model line: model, effort and how full its context is
export function modelLine(agent: PaneAgent): string {
  const parts = [shortModel(agent.model) || 'model unknown']
  if (agent.effort) parts.push(`${agent.effort} effort`)
  if (agent.contextTokens) parts.push(`${formatTokens(agent.contextTokens)} context`)
  return parts.join(' · ')
}

// Word-wraps text to `columns`, breaking a word longer than a line
export function wrap(text: string, columns: number): string[] {
  const cells = Math.max(1, columns)
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let rest = word
      while (width(rest) > cells) {
        if (line) {
          out.push(line)
          line = ''
        }
        out.push([...rest].slice(0, cells).join(''))
        rest = [...rest].slice(cells).join('')
      }
      if (!rest) continue
      if (!line) line = rest
      else if (width(line) + 1 + width(rest) <= cells) line += ' ' + rest
      else {
        out.push(line)
        line = rest
      }
    }
    out.push(line)
  }
  return out
}

export function toolArg(input: Record<string, unknown>): string {
  for (const key of ARG_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim().split('\n')[0]!
  }
  return ''
}

// The open agent's conversation as lines that fit the pane: the prompts it was
// given, what it said, and a line per tool call; the last `maxLines` of them
export function transcript(messages: readonly SessionMessage[], columns: number, maxLines: number): Line[] {
  const lines: Line[] = []
  for (const message of messages) {
    const text = message.text.trim()
    if (message.role === 'user') {
      if (text) lines.push(...wrap(`› ${text}`, columns).map(line => ({ text: line, isUser: true })))
      continue
    }
    if (text) lines.push(...wrap(text, columns).map(line => ({ text: line })))
    for (const use of message.toolUses) {
      const call = `→ ${use.tool} ${toolArg(use.input)}`.trimEnd() + (use.isError ? ' ✗' : '')
      lines.push({ text: truncate(call, columns), isDim: true })
    }
  }
  if (maxLines <= 0) return []
  if (lines.length <= maxLines) return lines
  const hidden = lines.length - maxLines + 1
  return [{ text: `… ${hidden} earlier lines`, isDim: true }, ...lines.slice(-(maxLines - 1))]
}
