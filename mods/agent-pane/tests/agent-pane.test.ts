import type { AgentInfo, On, SessionMessage } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { PaneAgent } from '../types'
import { estimatePercent, merge, rows, toolArg, transcript, who, wrap } from '../hooks/agents.ts'

const SURFACES = ['terminal', 'desktop'] as const
const PANE = {
  title: 'Agents',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const
const SPAWN = {
  tool_use_id: 'toolu_1',
  prompt: 'look around',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
} as const
const USAGE = { model: 'claude-haiku-4-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const TRANSCRIPT: SessionMessage[] = [
  { role: 'user', text: 'Find the auth code', toolUses: [] },
  { role: 'assistant', text: 'Looking in src.', toolUses: [{ tool_use_id: 'toolu_g', tool: 'Grep', input: { pattern: 'login' } }] },
  { role: 'assistant', text: 'It lives in src/auth.ts.', toolUses: [] },
]

type World = {
  listed: AgentInfo[]
  opened: string[]
  sent: { to: unknown; text: string }[]
  refusal?: string
}

// The engine beneath the mod: a clock and store in memory, agent ids a1, a2, ...,
// a list of agents the test can change, and a transcript for each
function engine(on: On, world: World) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  let count = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: `a${++count}` }))
  on('agent.list', () => ({ value: world.listed }))
  on('session.messages', (_$, e) => ({ value: e.agentId === 'a1' ? TRANSCRIPT : { deny: `no transcript for ${e.agentId}` } }))
  on('session.send', (_$, e) => {
    world.sent.push({ to: e.to, text: e.text })
    return world.refusal ? { isDelivered: false, reason: world.refusal } : { isDelivered: true }
  })
  on('ui.open', (_$, e) => {
    world.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: USAGE }
  })
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
  return clock
}

function newWorld(): World {
  return { listed: [], opened: [], sent: [] }
}

async function start($: any) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

async function spawn($: any, subagentType: string, description: string) {
  await $.agent.spawn({ ...SPAWN, subagentType, description })
}

async function step($: any, agentId: string, index: number) {
  const stream = $.turn.step({ turnId: `turn-${agentId}`, index, model: 'claude-haiku-4-5', messageCount: 1, agentId })
  for await (const _ of stream) {
    // drain the stream so the step completes
  }
}

async function complete($: any, agentId: string) {
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: `turn-${agentId}`, agentId, reason: 'answer' })
}

function mount($: any, surface: (typeof SURFACES)[number], props: object = PANE) {
  return $.ui.mount({ plugin: 'agent-pane', surface, component: 'Pane', requestId: 'agents', props })
}

function agent(overrides: Partial<PaneAgent>): PaneAgent {
  return { id: 'a1', type: 'Explore', description: 'find auth', status: 'running', isTeammate: false, startedAt: 0, steps: 0, ...overrides }
}

describe('helpers', () => {
  test('merge adds listed agents, takes their status and ends vanished ones', () => {
    const listed: AgentInfo[] = [
      { id: 'a1', type: 'Explore', description: 'find auth', status: 'completed' },
      { id: 'a2', type: 'Plan', description: 'plan it', status: 'running' },
    ]
    const merged = merge([agent({ id: 'a1' }), agent({ id: 'a0', startedAt: 0 })], listed, 10_000)
    expect(merged.map(a => [a.id, a.status])).toEqual([
      ['a1', 'completed'],
      ['a0', 'completed'],
      ['a2', 'running'],
    ])
    expect(merged[0]!.finishedAt).toBe(10_000)
  })

  test('a finished agent listed as running again starts a fresh run', () => {
    const done = agent({ status: 'completed', startedAt: 0, finishedAt: 5000, steps: 9 })
    const [again] = merge([done], [{ id: 'a1', type: 'Explore', description: 'find auth', status: 'running' }], 20_000)
    expect(again).toMatchObject({ status: 'running', startedAt: 20_000, steps: 0 })
    expect(again!.finishedAt).toBe(undefined)
  })

  test('rows put running agents first and fit the width', () => {
    const list = [
      agent({ id: 'a1', status: 'completed', startedAt: 0, finishedAt: 70_000 }),
      agent({ id: 'a2', type: 'general-purpose', description: 'a long task description here', startedAt: 1000, steps: 3 }),
    ]
    const drawn = rows(list, new Map(), 43_000, 60, 'a1')
    expect(drawn.map(r => r.id)).toEqual(['a2', 'a1'])
    expect(drawn[0]!.label).toContain('general')
    expect(drawn[0]!.label).toContain('~20%')
    expect(drawn[0]!.label).toContain('0:42')
    expect(drawn[1]!.label.startsWith('▸✓')).toBe(true)
    expect(drawn[1]!.isDim).toBe(true)
    for (const row of drawn) expect([...row.label].length).toBeLessThanOrEqual(60)
  })

  test('teammates go by their name', () => {
    expect(who(agent({ isTeammate: true, name: 'reviewer', type: 'teammate' }))).toBe('reviewer')
    expect(who(agent({ type: 'plugin:code-reviewer' }))).toBe('code-reviewer')
  })

  test('estimates cap at 95 until done', () => {
    expect(estimatePercent({ steps: 3, status: 'running' }, [10, 10, 10])).toBe(30)
    expect(estimatePercent({ steps: 40, status: 'running' }, [10, 10, 10])).toBe(95)
    expect(estimatePercent({ steps: 1, status: 'completed' })).toBe(100)
  })

  test('wrap breaks on words and splits words longer than a line', () => {
    expect(wrap('the quick brown fox', 9)).toEqual(['the quick', 'brown fox'])
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrap('one\ntwo', 10)).toEqual(['one', 'two'])
  })

  test('transcript keeps the last lines and names each tool call', () => {
    expect(toolArg({ file_path: 'src/a.ts', pattern: 'x' })).toBe('src/a.ts')
    const all = transcript(TRANSCRIPT, 40, 20)
    expect(all.map(l => l.text)).toEqual(['› Find the auth code', 'Looking in src.', '→ Grep login', 'It lives in src/auth.ts.'])
    expect(all[0]!.isUser).toBe(true)
    expect(all[2]!.isDim).toBe(true)
    const cut = transcript(TRANSCRIPT, 40, 3)
    expect(cut.map(l => l.text)).toEqual(['… 2 earlier lines', '→ Grep login', 'It lives in src/auth.ts.'])
  })
})

describe('pane', () => {
  test('lists the agents as they start and opens unasked', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    expect(world.opened).toEqual([])
    await spawn($, 'Explore', 'find auth code')
    await spawn($, 'Plan', 'design the pane')
    expect(world.opened).toEqual(['agents', 'agents'])
    for (const surface of SURFACES) {
      const ui = await mount($, surface)
      expect((await ui.find({ type: 'Text', text: /2 agents · 2 running/ }))?.text).toBeDefined()
      const buttons = await ui.findAll({ type: 'Button' })
      expect(buttons.map((b: { key: string }) => b.key).sort()).toEqual(['agent:a1', 'agent:a2'])
      expect(String((await ui.find({ key: 'agent:a1' }))?.props.label)).toContain('find auth code')
      await ui.unmount()
    }
  })

  test('marks the agent whose transcript is in view', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    await spawn($, 'Explore', 'find auth code')
    const ui = await mount($, 'terminal', { ...PANE, view: { agentId: 'a1' } })
    expect(String((await ui.find({ key: 'agent:a1' }))?.props.label).startsWith('▸')).toBe(true)
    await ui.unmount()
  })

  test('opening an agent shows its transcript and Back returns to the list', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    await spawn($, 'Explore', 'find auth code')
    await step($, 'a1', 0)
    await step($, 'a1', 1)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)
      await ui.press({ key: 'agent:a1' })
      expect(await ui.find({ key: 'back' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Explore · find auth code/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /running · 0:00 · ~13% · 2 requests/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'It lives in src/auth.ts.' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '→ Grep login' })).toBeDefined()
      await ui.press({ key: 'back' })
      expect(await ui.find({ key: 'agent:a1' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('says why an agent with no transcript cannot be read', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    await spawn($, 'Explore', 'one')
    await spawn($, 'Plan', 'two')
    const ui = await mount($, 'terminal')
    await ui.press({ key: 'agent:a2' })
    expect(await ui.find({ type: 'Text', text: 'no transcript for a2' })).toBeDefined()
    await ui.unmount()
  })

  test('messages the open agent and clears the field once delivered', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    await spawn($, 'Explore', 'find auth code')
    for (const surface of SURFACES) {
      world.sent = []
      const ui = await mount($, surface)
      await ui.press({ key: 'agent:a1' })
      await ui.input({ key: 'message', text: 'also check tests', kind: 'change' })
      expect((await ui.find({ key: 'message' }))?.props.value).toBe('also check tests')
      await ui.input({ key: 'message', text: 'also check tests' })
      // The engine spells `{ agentId }` as the bare id before session.send hooks see it
      expect(world.sent).toEqual([{ to: 'a1', text: 'also check tests' }])
      expect(await ui.find({ type: 'Text', text: 'Sent.' })).toBeDefined()
      expect((await ui.find({ key: 'message' }))?.props.value).toBe('')
      await ui.press({ key: 'back' })
      await ui.unmount()
    }
  })

  test('keeps the message and says why when it is not delivered', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    await spawn($, 'Explore', 'find auth code')
    world.refusal = 'the recipient is gone'
    const ui = await mount($, 'terminal')
    await ui.press({ key: 'agent:a1' })
    await ui.input({ key: 'message', text: 'hello', kind: 'change' })
    await ui.input({ key: 'message', text: 'hello' })
    expect(await ui.find({ type: 'Text', text: 'Not delivered: the recipient is gone' })).toBeDefined()
    expect((await ui.find({ key: 'message' }))?.props.value).toBe('hello')
    await ui.unmount()
  })

  test('a finished agent shows done, and a step after a message marks it running again', async ($, on) => {
    const world = newWorld()
    const clock = engine(on, world)
    await start($)
    await spawn($, 'Explore', 'find auth code')
    await step($, 'a1', 0)
    await clock.advance(5000)
    await complete($, 'a1')
    let ui = await mount($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /1 agent · 0 running/ })).toBeDefined()
    expect(String((await ui.find({ key: 'agent:a1' }))?.props.label)).toContain('done')
    await ui.unmount()
    await step($, 'a1', 0)
    ui = await mount($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /1 agent · 1 running/ })).toBeDefined()
    await ui.unmount()
  })

  test('the command opens the pane when asked', async ($, on) => {
    const world = newWorld()
    engine(on, world)
    await start($)
    const ran = await $.command.run({
      command: 'agent-pane',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })
    expect(ran).toMatchObject({ text: 'Agents pane opened.' })
    expect(world.opened).toEqual(['agents'])
    const ui = await mount($, 'terminal')
    expect(await ui.find({ type: 'Text', text: 'No agents yet' })).toBeDefined()
    await ui.unmount()
  })
})
