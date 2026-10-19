import type { AgentInfo, On, SessionMessage } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { PaneAgent } from '../types'
import { buildRoster, paint, parseDefinition, rosterRows, runsText } from '../hooks/roster.ts'
import { MASCOT_CELLS, cutParts, estimatePercent, formatTokens, mascots, merge, progressLine, rows, shortModel, sprite, toolArg, transcript, typeColor, who, wrap } from '../hooks/agents.ts'

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
const USAGE = { model: 'claude-haiku-4-5', input_tokens: 300, output_tokens: 1200, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 }
const TRANSCRIPT: SessionMessage[] = [
  { role: 'user', text: 'Find the auth code', toolUses: [] },
  { role: 'assistant', text: 'Looking in src.', toolUses: [{ tool_use_id: 'toolu_g', tool: 'Grep', input: { pattern: 'login' } }] },
  { role: 'assistant', text: 'It lives in src/auth.ts.', toolUses: [] },
]

type World = {
  listed: AgentInfo[]
  // Agent definition files by folder, read through $.fs
  files: Record<string, Record<string, string>>
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
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.list', (_$, e) => {
    const dir = world.files[e.path]
    if (!dir) throw new Error(`no such folder ${e.path}`)
    return { value: Object.keys(dir).map(name => ({ name, kind: 'file' as const, size: 1 })) }
  })
  on('fs.read', (_$, e) => {
    const cut = e.path.lastIndexOf('/')
    return { value: world.files[e.path.slice(0, cut)]![e.path.slice(cut + 1)]! }
  })
  on('agent.offer', () => ({ isOffered: true }))
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
  return { listed: [], opened: [], sent: [], files: {} }
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

  test('row parts carry colours and join to the label', () => {
    const [row] = rows([agent({ model: 'claude-sonnet-5-5', steps: 3 })], new Map(), 1000, 60)
    expect(row!.parts.map(p => p.text).join('')).toBe(row!.label)
    expect(row!.parts.find(p => p.text.startsWith('Explore'))?.color).toBe(typeColor('Explore'))
    expect(row!.parts.find(p => p.text === '●')?.color).toBe('claude')
    expect(row!.label).toContain('sonnet 5.5')
  })

  test('a type keeps its colour and a definition colour wins', () => {
    expect(typeColor('Explore')).toBe(typeColor('plugin:Explore'))
    expect(typeColor('Explore', 'blue')).toBe('#3d9be9')
  })

  test('cutParts ends in an ellipsis at the width', () => {
    const cut = cutParts([{ text: 'abc' }, { text: 'defgh', color: 'red' }], 6)
    expect(cut.map(p => p.text)).toEqual(['abc', 'de…'])
    expect(cut[1]!.color).toBe('red')
  })

  test('models and tokens read short', () => {
    expect(shortModel('claude-sonnet-5-5')).toBe('sonnet 5.5')
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
    expect(shortModel('claude-opus-5-5[1m]')).toBe('opus 5.5')
    expect(shortModel('us.anthropic.claude-fable-5-1')).toBe('fable 5.1')
    expect(shortModel(undefined)).toBe('')
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(2400)).toBe('2.4k')
    expect(formatTokens(12_400)).toBe('12k')
    expect(formatTokens(1_250_000)).toBe('1.3M')
  })

  test('a sprite is five cells wide, fixed per type, and its face follows status', () => {
    for (const type of ['Explore', 'Plan', 'general-purpose', 'code-reviewer']) {
      for (const line of sprite(type, 'running', 0)) expect([...line].length).toBe(5)
    }
    expect(sprite('Explore', 'running', 0)[0]).toBe(sprite('Explore', 'failed', 0)[0])
    expect(sprite('Explore', 'running', 0)[1]).toBe('(•‿•)')
    expect(sprite('Explore', 'running', 2000)[1]).toBe('(-‿-)')
    expect(sprite('Explore', 'completed', 0)[1]).toBe('(^‿^)')
    expect(sprite('Explore', 'failed', 0)[1]).toBe('(×_×)')
  })

  test('rows wear their mascot face and a finished row keeps its colours', () => {
    const [running, done] = rows(
      [agent({ id: 'a1' }), agent({ id: 'a2', type: 'Plan', status: 'completed', startedAt: 0, finishedAt: 1000 })],
      new Map(),
      0,
      70,
    )
    expect(running!.label).toContain('(•‿•) Explore')
    expect(done!.label).toContain('(^‿^) Plan')
    expect(done!.parts.filter(p => p.keepColor).map(p => p.text.trim())).toEqual(['✓', '(^‿^)', 'Plan'])
    expect(rows([agent({})], new Map(), 0, 40)[0]!.label).not.toContain('(•‿•)')
  })

  test('the mascot strip fits the width, running agents first', () => {
    const list = [
      agent({ id: 'a1', status: 'completed', startedAt: 0, finishedAt: 1 }),
      agent({ id: 'a2', type: 'Plan', startedAt: 5 }),
      agent({ id: 'a3', type: 'general-purpose', startedAt: 9 }),
    ]
    const strip = mascots(list, 0, 2 * MASCOT_CELLS + 1)
    expect(strip.map(m => m.id)).toEqual(['a3', 'a2'])
    for (const m of strip) for (const line of [...m.lines, m.name]) expect([...line].length).toBe(MASCOT_CELLS)
    expect(strip[1]!.lines[1]!.trim()).toBe('(•‿•)')
    expect(strip[1]!.name.trim()).toBe('Plan')
    expect(mascots(list, 0, 5)).toEqual([])
  })

  test('the progress line fills when done', () => {
    expect(progressLine(agent({ steps: 3 }), [10, 10, 10], 10)).toBe('███░░░░░░░ ~30%')
    expect(progressLine(agent({ status: 'completed' }), undefined, 4)).toBe('████ done')
  })

  test('a definition reads its frontmatter', () => {
    const text = '---\nname: researcher\ndescription: "Deep research"\nmodel: opus\ncolor: purple\n---\nBody'
    expect(parseDefinition(text, 'user')).toEqual({ name: 'researcher', description: 'Deep research', model: 'opus', color: 'purple', source: 'user' })
    expect(parseDefinition('no frontmatter', 'user')).toBe(undefined)
    expect(parseDefinition('---\ndescription: x\n---', 'user')).toBe(undefined)
  })

  test('the roster puts definitions, offered agents and run built-ins together, most-run first', () => {
    const defs = [
      { name: 'researcher', description: 'Deep research', model: 'opus', source: 'project' },
      { name: 'researcher', description: 'user copy', source: 'user' },
      { name: 'test-writer', description: '', source: 'user' },
    ]
    const offers = [
      { name: 'Explore', description: 'Fast search', source: 'built-in' },
      { name: 'Plan', description: 'Plans', source: 'built-in' },
      { name: 'superpowers:code-reviewer', description: 'Reviews', source: 'plugin' },
      { name: 'test-writer', description: 'Writes tests', source: 'user' },
    ]
    const history = new Map([['Explore', [4, 6, 8]], ['plugin:researcher', [9]]])
    const roster = buildRoster(defs, offers, history)
    expect(roster.map(r => [r.name, r.runs])).toEqual([
      ['Explore', 3],
      ['researcher', 1],
      ['code-reviewer', 0],
      ['test-writer', 0],
    ])
    expect(roster[0]).toMatchObject({ typicalSteps: 6, source: 'built-in' })
    expect(roster[1]).toMatchObject({ description: 'Deep research', source: 'project' })
    expect(roster[3]!.description).toBe('Writes tests')
    expect(runsText(roster[0]!)).toBe('ran 3× · ~6 steps')
    expect(runsText({ runs: 20 })).toBe('ran 20+×')
    expect(runsText({ runs: 0 })).toBe('not run yet')
  })

  test('agents take their definition colour', () => {
    const [painted, plain] = paint(
      [agent({ id: 'a1', type: 'plugin:researcher' }), agent({ id: 'a2', type: 'Explore' })],
      [{ name: 'researcher', description: '', color: 'purple', source: 'user', runs: 0 }],
    )
    expect(painted!.color).toBe('purple')
    expect(plain!.color).toBe(undefined)
    const [row] = rows([painted!], new Map(), 0, 60)
    expect(row!.parts.find(p => p.text.startsWith('researcher'))?.color).toBe('#b07cc6')
  })

  test('roster rows mark running agents and fold the rest', () => {
    const roster = ['a', 'b', 'c'].map(name => ({ name, description: '', source: 'user', runs: 0 }))
    const { rows: drawn, hidden } = rosterRows(roster, new Set(['b']), 50, 0, 2)
    expect(drawn.map(r => r.name)).toEqual(['a', 'b'])
    expect(drawn[1]!.label).toContain('● running')
    expect(drawn[0]!.label).toContain('not run yet')
    expect(drawn[0]!.label).toContain('(·_·)')
    expect(drawn[1]!.label).toContain('(•‿•)')
    expect(hidden).toBe(1)
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
      expect(String((await ui.find({ key: 'agent:a1' }))?.props.label)).toContain('haiku 4.5')
      expect(await ui.find({ key: 'mascots' })).toBeDefined()
      expect(await ui.find({ key: 'm:a1' })).toBeDefined()
      expect(await ui.find({ key: 'm:a2' })).toBeDefined()
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
      expect(await ui.find({ type: 'Text', text: /running · 0:00 · ~13% · 2 requests · 2.4k out/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'haiku 4.5 · 4.3k context' })).toBeDefined()
      expect(await ui.find({ key: 'card' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\(.‿.\)$/ })).toBeDefined()
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

  test('lists your agents from definitions and offers, and opens one as a card', async ($, on) => {
    const world = newWorld()
    world.files['/tmp/.claude/agents'] = {
      'researcher.md': '---\nname: researcher\ndescription: Deep research\nmodel: opus\ncolor: purple\n---\n',
      'notes.txt': 'skipped',
    }
    world.files['/home/me/.claude/agents'] = { 'test-writer.md': '---\nname: test-writer\ndescription: Writes tests\nmodel: sonnet\n---\n' }
    engine(on, world)
    await start($)
    await $.agent.offer({ agent: 'superpowers:code-reviewer', description: 'Reviews', source: 'plugin', provider: { plugin: 'superpowers', tier: 'user' } })
    for (const surface of SURFACES) {
      const ui = await mount($, surface)
      expect(await ui.find({ type: 'Text', text: 'Your agents' })).toBeDefined()
      const keys = (await ui.findAll({ type: 'Button' })).map((b: { key: string }) => b.key).sort()
      expect(keys).toEqual(['def:code-reviewer', 'def:researcher', 'def:test-writer'])
      expect(String((await ui.find({ key: 'def:researcher' }))?.props.label)).toContain('opus')
      await ui.press({ key: 'def:researcher' })
      expect(await ui.find({ key: 'card' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Deep research' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'not run yet · project' })).toBeDefined()
      await ui.press({ key: 'back' })
      await ui.unmount()
    }
    await spawn($, 'researcher', 'dig in')
    const ui = await mount($, 'terminal')
    expect(String((await ui.find({ key: 'def:researcher' }))?.props.label)).toContain('● running')
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
    expect(await ui.find({ type: 'Text', text: 'No agents running' })).toBeDefined()
    await ui.unmount()
  })
})
