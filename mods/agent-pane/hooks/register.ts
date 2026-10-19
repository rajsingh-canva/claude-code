import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, TurnCompleteReason } from 'claude-code'

import type { PaneAgent, RosterAgent } from '../types'
import {
  type Line,
  type Part,
  type Status,
  glyph,
  isActive,
  merge,
  modelColor,
  modelLine,
  progressLine,
  pushHistory,
  rows,
  shortModel,
  shortType,
  sprite,
  statusColor,
  summary,
  transcript,
  typeColor,
  who,
  withStatus,
} from './agents.ts'
import { type Definition, type Offer, buildRoster, paint, parseDefinition, rosterRows, runsText } from './roster.ts'

const PANE = 'agents'
const TITLE = 'Agents'
const COMMAND = 'agent-pane'
const HISTORY_PREFIX = 'hist:'
// Rows the open agent's view spends around its transcript: Back, the card
// (four lines and its border), two rules, field, notice
const DETAIL_CHROME = 11
// The card's border and padding, plus the sprite and the gap after it
const CARD_CHROME = 4 + 5 + 1

const agents = atom({ plugin: 'agent-pane', key: 'agents' } as const, [] as PaneAgent[])
const selected = atom({ plugin: 'agent-pane', key: 'selected' } as const, '')
const draft = atom({ plugin: 'agent-pane', key: 'draft' } as const, '')
const notice = atom({ plugin: 'agent-pane', key: 'notice' } as const, '')
const isDismissed = atom({ plugin: 'agent-pane', key: 'isDismissed' } as const, false)
const roster = atom({ plugin: 'agent-pane', key: 'roster' } as const, [] as RosterAgent[])

const DEF_PREFIX = 'def:'
// Where agent definitions live, project first so its definition wins a name
const AGENT_DIRS = [
  { dir: '.claude/agents', source: 'project' },
  { dir: '~/.claude/agents', source: 'user' },
] as const

// Completed step counts per agent type, mirrored from $.store
const history = new Map<string, number[]>()
// Agent definition files read at session start, and the types the engine offered
let definitions: Definition[] = []
const offers = new Map<string, Offer>()
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
  await refreshRoster($)
}

async function loadDefinitions($: EngineInterface, cwd: string) {
  const home = await $.env.get('HOME')
  const found: Definition[] = []
  for (const { dir, source } of AGENT_DIRS) {
    const path = dir.startsWith('~/') ? (home ? `${home}/${dir.slice(2)}` : undefined) : `${cwd}/${dir}`
    if (path === undefined) continue
    try {
      for (const entry of await $.fs.list(path)) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
        const def = parseDefinition(await $.fs.read(`${path}/${entry.name}`), source)
        if (def) found.push(def)
      }
    } catch {
      // A missing or unreadable folder just has no definitions
    }
  }
  definitions = found
}

// Rebuilds the roster and gives the pane's agents their definitions' colours
async function refreshRoster($: EngineInterface) {
  const built = buildRoster(definitions, offers.values(), history)
  await update($, roster, () => built)
  await update($, agents, list => paint(list, built))
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
  const known = await read($, roster)
  const list = await update($, agents, current => paint(merge(current, listed, now), known))
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
    await loadDefinitions($, e.cwd)
    await refreshRoster($)
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
      model: spawned.model ?? e.model ?? e.parentModel,
    }
    if (e.name !== undefined) agent.name = e.name
    const known = await read($, roster)
    await update($, agents, list => (list.some(a => a.id === id) ? list : paint([...list, agent], known)))
    startTick($)
    await openUnasked($)
    return spawned
  })
    // The agent has started by the time anything here can fail: answer with that spawn, never a second one
    .catch(($, e, next) => next(e))

  // Each agent type offered to the model joins the roster: plugin agents and
  // ones from settings, which have no definition file this mod reads
  on('agent.offer', async ($, e, next) => {
    const isNew = !offers.has(e.agent)
    offers.set(e.agent, { name: e.agent, description: e.description, source: e.source })
    if (isNew) await refreshRoster($)
    return next(e)
  })
    // The roster is a nicety: never let it change what the model is offered
    .catch(($, e, next) => next(e))

  // Each model request an agent makes is one step towards its estimate, and
  // says which model and effort it ran on and what it cost
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    const isOurs = id !== undefined && (await read($, agents)).some(a => a.id === id)
    if (isOurs) {
      const now = await $.clock.now()
      const effort = e.effort === undefined ? undefined : String(e.effort)
      // max() keeps a retried request from counting twice; a step of a finished agent means it was resumed
      await update($, agents, list =>
        list.map(a =>
          a.id === id
            ? {
                ...withStatus(a, 'running', now),
                steps: Math.max(isActive(a) ? a.steps : 0, e.index + 1),
                model: e.model,
                ...(effort === undefined ? {} : { effort }),
              }
            : a,
        ),
      )
      startTick($)
    }
    const result = yield* next(e)
    const usage = result.usage
    if (isOurs && usage) {
      const context = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      await update($, agents, list =>
        list.map(a =>
          a.id === id ? { ...a, outputTokens: (a.outputTokens ?? 0) + usage.output_tokens, contextTokens: context } : a,
        ),
      )
    }
    return result
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

    // A row's coloured runs; a dim row keeps its status colour (`keep`) and dims the rest
    const runs = (parts: readonly Part[], isDim = false, keep = -1) =>
      parts.map((part, i) =>
        Text({
          key: `p${i}`,
          ...(part.color === undefined ? {} : { color: part.color }),
          bold: part.isBold === true && !isDim,
          dimColor: part.isDim === true || (isDim && i !== keep),
          wrap: 'truncate-end',
          children: [part.text],
        }),
      )
    const known = await read($, roster)

    if (openId.startsWith(DEF_PREFIX)) {
      const def = known.find(r => r.name === openId.slice(DEF_PREFIX.length))
      if (def !== undefined) {
        const color = typeColor(def.name, def.color)
        return Box({
          flexDirection: 'column',
          children: [
            Button({ key: 'back', label: '← Agents', plain: true, dimColor: true, onPress: () => open($, '') }),
            Box({
              key: 'card',
              flexDirection: 'row',
              gap: 1,
              paddingX: 1,
              borderStyle: 'round',
              borderColor: color,
              children: [
                Box({
                  flexDirection: 'column',
                  children: sprite(def.name, 'idle', now).map((line, i) => Text({ key: `s${i}`, color, children: [line] })),
                }),
                Box({
                  flexDirection: 'column',
                  flexGrow: 1,
                  children: [
                    Text({ color, bold: true, wrap: 'truncate-end', children: [def.name] }),
                    Text({ color: modelColor(def.model), wrap: 'truncate-end', children: [shortModel(def.model) || 'inherits model'] }),
                    Text({ dimColor: true, wrap: 'truncate-end', children: [`${runsText(def)} · ${def.source}`] }),
                  ],
                }),
              ],
            }),
            ...(def.description ? [Text({ wrap: 'wrap', children: [def.description] })] : []),
            Text({ dimColor: true, wrap: 'wrap', children: [`Ask Claude for it: "use the ${def.name} agent to …"`] }),
          ],
        })
      }
    }

    if (agent === undefined) {
      const running = list.filter(isActive).length
      const head = list.length === 0 ? 'No agents running' : `${list.length} agent${list.length === 1 ? '' : 's'} · ${running} running`
      const lines = rows(list, history, now, columns, e.props.view.agentId)
      const runningNames = new Set(list.filter(isActive).map(a => shortType(a.type)))
      const yours = rosterRows(known, runningNames, columns)
      const hint =
        list.length > 0 ? 'Open one to read it or message it.' : known.length > 0 ? 'Open one of yours to see it.' : 'Agents show here as they start.'
      return Box({
        flexDirection: 'column',
        children: [
          Text({ bold: true, wrap: 'truncate-end', children: [head] }),
          ...lines.map(row =>
            Button({
              key: `agent:${row.id}`,
              label: row.label,
              plain: true,
              onPress: () => open($, row.id),
              children: runs(row.parts, row.isDim, 1),
            }),
          ),
          ...(yours.rows.length > 0
            ? [
                Text({ key: 'yours', bold: true, wrap: 'truncate-end', children: ['Your agents'] }),
                ...yours.rows.map(row =>
                  Button({
                    key: `${DEF_PREFIX}${row.name}`,
                    label: row.label,
                    plain: true,
                    onPress: () => open($, DEF_PREFIX + row.name),
                    children: runs(row.parts),
                  }),
                ),
                ...(yours.hidden > 0 ? [Text({ dimColor: true, children: [`  +${yours.hidden} more`] })] : []),
              ]
            : []),
          Text({ dimColor: true, wrap: 'truncate-end', children: [hint] }),
        ],
      })
    }

    const found = await $.session.messages({ agentId: agent.id })
    const room = Math.max(3, e.props.scroll.bodyRows - DETAIL_CHROME)
    const lines: Line[] = Array.isArray(found) ? transcript(found, columns, room) : [{ text: found.deny, isDim: true }]
    const rule = '─'.repeat(Math.max(1, columns))
    const color = typeColor(agent.type, agent.color)
    const barCells = Math.max(4, Math.min(20, columns - CARD_CHROME - 12))
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
        Button({ key: 'back', label: '← Agents', plain: true, dimColor: true, onPress: () => open($, '') }),
        Box({
          key: 'card',
          flexDirection: 'row',
          gap: 1,
          paddingX: 1,
          borderStyle: 'round',
          borderColor: color,
          children: [
            Box({
              flexDirection: 'column',
              children: sprite(agent.type, agent.status, now).map((line, i) =>
                Text({ key: `s${i}`, color: i === 1 ? statusColor(agent.status) : color, children: [line] }),
              ),
            }),
            Box({
              flexDirection: 'column',
              flexGrow: 1,
              children: [
                Text({
                  wrap: 'truncate-end',
                  children: [
                    Text({ color: statusColor(agent.status), children: [glyph(agent.status)] }),
                    ' ',
                    Text({ color, bold: true, children: [who(agent)] }),
                    ` · ${agent.description}`,
                  ],
                }),
                Text({ color: modelColor(agent.model), wrap: 'truncate-end', children: [modelLine(agent)] }),
                Text({
                  color: agent.status === 'running' ? color : statusColor(agent.status),
                  wrap: 'truncate-end',
                  children: [progressLine(agent, history.get(agent.type), barCells)],
                }),
                Text({ dimColor: true, wrap: 'truncate-end', children: [summary(agent, history.get(agent.type), now)] }),
              ],
            }),
          ],
        }),
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
