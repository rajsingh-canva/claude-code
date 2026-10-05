import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import { type AgentRow, layout, pushHistory } from './progress.ts'

type Tracked = Omit<AgentRow, 'steps'>

const HISTORY_PREFIX = 'hist:'
// The band stays this long after the last agent finishes
const HIDE_AFTER_MS = 5000
// An agent missing from $.agent.list() this soon after it started may just not be listed yet
const VANISH_GRACE_MS = 3000
const ACTIVE = new Set(['pending', 'running', 'waiting'])
const ENDED = new Set(['completed', 'failed', 'killed', 'idle'])

// Agents shown in the band, by agent id
const agents = new Map<string, Tracked>()
// Model requests per agent id, counted for every subagent so a first step that
// arrives before agent.spawn resolves is not lost
const steps = new Map<string, number>()
// Completed step counts per agent type, mirrored from $.store
const history = new Map<string, number[]>()
let tick: { cancel: () => void } | undefined

function isTeammate(info: AgentInfo): boolean {
  return info.type === 'teammate' || info.teammateId !== undefined
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : []
}

async function loadHistory($: EngineInterface) {
  for (const key of await $.store.keys()) {
    if (key.startsWith(HISTORY_PREFIX)) {
      history.set(key.slice(HISTORY_PREFIX.length), numbers(await $.store.get(key)))
    }
  }
}

async function saveHistory($: EngineInterface, type: string, count: number) {
  if (count <= 0) return
  // Read the store again, as another session may have added a run since we loaded it
  const updated = pushHistory(numbers(await $.store.get(HISTORY_PREFIX + type)), count)
  history.set(type, updated)
  await $.store.set(HISTORY_PREFIX + type, updated)
}

// Reconciles the band with $.agent.list(): picks up agents whose spawn this mod
// never saw (hidden by a guard, or started before a reload), ends the ones that
// stopped without a turn.complete, and hides the band once everything has settled
async function sync($: EngineInterface) {
  const now = await $.clock.now()
  let listed: AgentInfo[] = []
  try {
    listed = await $.agent.list()
  } catch {
    // Keep what the events reported when the list is unavailable
  }
  const live = new Map(listed.map(info => [info.id, info]))
  for (const info of listed) {
    if (!isTeammate(info) && ACTIVE.has(info.status) && !agents.has(info.id)) {
      agents.set(info.id, { id: info.id, type: info.type, description: info.description, startedAt: now, isDone: false })
    }
  }
  for (const agent of agents.values()) {
    if (agent.isDone) continue
    const info = live.get(agent.id)
    const hasEnded = info === undefined ? now - agent.startedAt > VANISH_GRACE_MS : ENDED.has(info.status)
    if (hasEnded) {
      agent.isDone = true
      agent.finishedAt = now
    }
  }
  for (const id of steps.keys()) {
    if (!agents.has(id) && !live.has(id)) steps.delete(id)
  }
  const isSettled = [...agents.values()].every(a => a.isDone && now - (a.finishedAt ?? now) >= HIDE_AFTER_MS)
  if (isSettled) {
    agents.clear()
    tick?.cancel()
    tick = undefined
  }
  $.ui.invalidate('ui.render')
}

// Refreshes elapsed times and reconciles once a second while agents are shown
function startTick($: EngineInterface) {
  if (tick) return
  tick = $.clock.every(1000, () => {
    void sync($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadHistory($)
    // After a reload the module starts empty, so pick up agents already running
    await sync($)
    if (agents.size > 0) startTick($)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = 'agentId' in spawned ? spawned.agentId : undefined
    if (e.isTeammate || id === undefined) return spawned
    if (!agents.has(id)) {
      agents.set(id, { id, type: e.subagentType, description: e.description, startedAt: await $.clock.now(), isDone: false })
    }
    startTick($)
    $.ui.invalidate('ui.render')
    return spawned
  })

  // Each model request a subagent makes is one step towards its estimate
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      // max() keeps a retried request from counting twice
      steps.set(e.agentId, Math.max(steps.get(e.agentId) ?? 0, e.index + 1))
      if (agents.has(e.agentId)) $.ui.invalidate('ui.render')
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agent = e.agentId === undefined ? undefined : agents.get(e.agentId)
    if (agent && !agent.isDone) {
      agent.isDone = true
      agent.finishedAt = await $.clock.now()
      // Only a run that answered teaches the estimate what a whole run looks like
      if (e.reason === 'answer') await saveHistory($, agent.type, steps.get(agent.id) ?? 0)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (agents.size === 0 || e.props.hasSurvey) return next(e)
    const now = await $.clock.now()
    const rows = [...agents.values()].map(agent => ({ ...agent, steps: steps.get(agent.id) ?? 0 }))
    const lines = layout(rows, history, now, e.props.bodyColumns, e.props.maxRows)
    const { Box, Text } = $.ui.resolve(e)
    const ours = lines.map(line => Text({ dimColor: line.isDim === true, wrap: 'truncate-end', children: [line.text] }))
    // Keep whatever the mods after this one draw in the band
    const theirs = await next(e)
    return Box({ flexDirection: 'column', children: theirs ? [...ours, theirs] : ours })
  })
}
