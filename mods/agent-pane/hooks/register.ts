import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, TurnCompleteReason } from 'claude-code'

import type { PaneAgent } from '../types'
import { type Line, type Status, glyph, isActive, merge, pushHistory, rows, summary, transcript, who, withStatus } from './agents.ts'

const PANE = 'agents'
const TITLE = 'Agents'
const COMMAND = 'agent-pane'
const HISTORY_PREFIX = 'hist:'
// Rows the open agent's view spends around its transcript: name, summary, two rules, field, notice
const DETAIL_CHROME = 6

const agents = atom({ plugin: 'agent-pane', key: 'agents' } as const, [] as PaneAgent[])
const selected = atom({ plugin: 'agent-pane', key: 'selected' } as const, '')
const draft = atom({ plugin: 'agent-pane', key: 'draft' } as const, '')
const notice = atom({ plugin: 'agent-pane', key: 'notice' } as const, '')
const isDismissed = atom({ plugin: 'agent-pane', key: 'isDismissed' } as const, false)

// Completed step counts per agent type, mirrored from $.store
const history = new Map<string, number[]>()
let tick: { cancel: () => void } | undefined

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

function stopTick() {
  tick?.cancel()
  tick = undefined
}

// Reconciles the pane with $.agent.list() and, while anything runs, redraws its clocks
async function sync($: EngineInterface) {
  const now = await $.clock.now()
  let listed: AgentInfo[] = []
  try {
    listed = await $.agent.list()
  } catch {
    // Keep what the events reported when the list is unavailable
  }
  const list = await update($, agents, current => merge(current, listed, now))
  if (!list.some(isActive)) stopTick()
}

// Once a second while agents run
function startTick($: EngineInterface) {
  if (tick) return
  tick = $.clock.every(1000, () => {
    void sync($)
  })
}

// Opening unasked seats the pane as a sidebar on a wide terminal and waits below that
async function openUnasked($: EngineInterface) {
  if (await read($, isDismissed)) return
  await $.ui.open({ id: PANE, title: TITLE })
}

function endStatus(agent: PaneAgent, reason: TurnCompleteReason): Status {
  // A teammate's turn ending leaves it waiting for its next message
  if (agent.isTeammate) return 'idle'
  if (reason === 'aborted') return 'killed'
  if (reason === 'answer') return 'completed'
  return 'failed'
}

async function open($: EngineInterface, id: string) {
  await update($, selected, () => id)
  await update($, notice, () => '')
  await update($, draft, () => '')
}

async function send($: EngineInterface, id: string, text: string) {
  const message = text.trim()
  if (!message) return
  const sent = await $.session.send({ to: { agentId: id }, text: message })
  if (!sent.isDelivered) {
    await update($, notice, () => `Not delivered: ${sent.reason}`)
    return
  }
  await update($, draft, () => '')
  await update($, notice, () => 'Sent.')
  // A message resumes a finished agent; its next step marks it running again
  await sync($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show your agents in a pane: open one to read its transcript or message it',
    })
    await loadHistory($)
    // After a reload the module starts empty, so pick up agents already running
    await sync($)
    if ((await read($, agents)).some(isActive)) {
      startTick($)
      await openUnasked($)
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await update($, isDismissed, () => false)
    await sync($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Agents pane opened.' : `Agents pane is waiting: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await update($, isDismissed, () => true)
      await update($, selected, () => '')
    }
    return next(e)
  })
    // A failure here must not keep the pane open or close it twice
    .catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = 'agentId' in spawned ? spawned.agentId : undefined
    if (id === undefined) return spawned
    const now = await $.clock.now()
    const agent: PaneAgent = {
      id,
      type: e.subagentType,
      description: e.description,
      status: 'running',
      isTeammate: e.isTeammate === true,
      startedAt: now,
      steps: 0,
    }
    if (e.name !== undefined) agent.name = e.name
    await update($, agents, list => (list.some(a => a.id === id) ? list : [...list, agent]))
    startTick($)
    await openUnasked($)
    return spawned
  })
    // The agent has started by the time anything here can fail: answer with that spawn, never a second one
    .catch(($, e, next) => next(e))

  // Each model request an agent makes is one step towards its estimate
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id !== undefined && (await read($, agents)).some(a => a.id === id)) {
      const now = await $.clock.now()
      // max() keeps a retried request from counting twice; a step of a finished agent means it was resumed
      await update($, agents, list =>
        list.map(a => (a.id === id ? { ...withStatus(a, 'running', now), steps: Math.max(isActive(a) ? a.steps : 0, e.index + 1) } : a)),
      )
      startTick($)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    const agent = id === undefined ? undefined : (await read($, agents)).find(a => a.id === id)
    if (agent && isActive(agent)) {
      const now = await $.clock.now()
      await update($, agents, list => list.map(a => (a.id === id ? withStatus(a, endStatus(a, e.reason), now) : a)))
      // Only a run that answered teaches the estimate what a whole run looks like
      if (e.reason === 'answer' && !agent.isTeammate) await saveHistory($, agent.type, agent.steps)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const columns = e.props.bodyColumns
    const now = await $.clock.now()
    const list = await read($, agents)
    const openId = await read($, selected)
    const agent = list.find(a => a.id === openId)

    if (agent === undefined) {
      const running = list.filter(isActive).length
      const head = list.length === 0 ? 'No agents yet' : `${list.length} agent${list.length === 1 ? '' : 's'} · ${running} running`
      const lines = rows(list, history, now, columns, e.props.view.agentId)
      return Box({
        flexDirection: 'column',
        children: [
          Text({ bold: true, wrap: 'truncate-end', children: [head] }),
          ...lines.map(row =>
            Button({ key: `agent:${row.id}`, label: row.label, plain: true, dimColor: row.isDim, onPress: () => open($, row.id) }),
          ),
          Text({
            dimColor: true,
            wrap: 'truncate-end',
            children: [list.length === 0 ? 'Agents show here as they start.' : 'Open one to read it or message it.'],
          }),
        ],
      })
    }

    const found = await $.session.messages({ agentId: agent.id })
    const room = Math.max(3, e.props.scroll.bodyRows - DETAIL_CHROME)
    const lines: Line[] = Array.isArray(found) ? transcript(found, columns, room) : [{ text: found.deny, isDim: true }]
    const rule = '─'.repeat(Math.max(1, columns))
    const typed = await read($, draft)
    const said = await read($, notice)
    // The mobile app draws no field, so there the transcript is read-only
    const field =
      'Input' in table
        ? [
            table.Input({
              key: 'message',
              placeholder: `Message ${who(agent)}…`,
              submitLabel: 'send',
              value: typed,
              onInput: value => update($, draft, () => value),
              onSubmit: value => send($, agent.id, value),
            }),
          ]
        : []
    return Box({
      flexDirection: 'column',
      children: [
        Box({
          flexDirection: 'row',
          gap: 1,
          children: [
            Button({ key: 'back', label: '← Agents', plain: true, dimColor: true, onPress: () => open($, '') }),
            Text({ bold: true, wrap: 'truncate-end', children: [`${glyph(agent.status)} ${who(agent)} · ${agent.description}`] }),
          ],
        }),
        Text({ dimColor: true, wrap: 'truncate-end', children: [summary(agent, history.get(agent.type), now)] }),
        Text({ dimColor: true, children: [rule] }),
        ...lines.map(line =>
          Text({ dimColor: line.isDim === true, bold: line.isUser === true, wrap: 'truncate-end', children: [line.text] }),
        ),
        Text({ dimColor: true, children: [rule] }),
        ...field,
        ...(said ? [Text({ dimColor: true, wrap: 'truncate-end', children: [said] })] : []),
      ],
    })
  })
}
