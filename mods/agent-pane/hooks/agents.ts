// Pure helpers for agent-pane. Nothing here touches `$`, so the hooks
// module can import them and the tests can call them directly.

import type { AgentInfo, SessionMessage } from 'claude-code'

import type { PaneAgent } from '../types'

export type Status = PaneAgent['status']
export type Line = { text: string; isDim?: boolean; isUser?: boolean }
export type Row = { id: string; label: string; isDim: boolean }

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
  return isActive(agent) ? { ...rest, status } : { ...rest, status, startedAt: now, steps: 0 }
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

function progressText(agent: PaneAgent, pct: number, barCells: number): string {
  if (agent.status !== 'running') return statusWord(agent.status)
  return barCells > 0 ? `${bar(pct, barCells)} ~${pct}%` : `~${pct}%`
}

// One clickable line per agent: mark, glyph, who, task, progress and clock,
// the task cut to whatever room the rest leaves
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
  const tails = list.map(agent => {
    const pct = estimatePercent(agent, histories.get(agent.type))
    const clock = formatElapsed((agent.finishedAt ?? now) - agent.startedAt)
    return `${progressText(agent, pct, barCells)} ${clock.padStart(5)}`
  })
  const tailWidth = Math.max(...tails.map(width))
  return list.map((agent, i) => {
    const mark = agent.id === viewedId ? '▸' : ' '
    const head = `${mark}${glyph(agent.status)} ${pad(who(agent), whoWidth)} `
    const descWidth = columns - width(head) - tailWidth - 1
    const desc = descWidth >= 4 ? pad(agent.description, descWidth) + ' ' : ''
    const label = head + desc + tails[i]!.padStart(tailWidth)
    return { id: agent.id, label: truncate(label, columns), isDim: !isActive(agent) }
  })
}

// The open agent's one-line summary under its name
export function summary(agent: PaneAgent, history: readonly number[] | undefined, now: number): string {
  const clock = formatElapsed((agent.finishedAt ?? now) - agent.startedAt)
  const parts = [statusWord(agent.status), clock]
  if (agent.status === 'running') parts.push(`~${estimatePercent(agent, history)}%`)
  parts.push(`${agent.steps} request${agent.steps === 1 ? '' : 's'}`)
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
