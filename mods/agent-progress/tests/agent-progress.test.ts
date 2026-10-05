import type { AgentInfo, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { bar, estimatePercent, expectedSteps, formatElapsed, layout, median, pushHistory, shortType, truncate } from '../hooks/progress.ts'

const SURFACES = ['terminal', 'desktop'] as const
const BAND = { hasSurvey: false, isWorking: true, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} }
const SPAWN = {
  tool_use_id: 'toolu_1',
  prompt: 'look around',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
} as const

// The engine beneath the mod: a clock and store in memory, agent ids a1, a2, ...,
// and a list of running agents the test can change
function engine(on: On, listed: AgentInfo[] = [], writes: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  // Records what the mod saves, then lets the in-memory store keep it
  on('store.set', { key: /^hist:/ }, ($, e, next) => {
    writes[e.key] = e.value
    return next(e)
  })
  mock.store(on)
  let count = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: `a${++count}` }))
  on('agent.list', () => ({ value: listed }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use' }
  })
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }))
  return clock
}

async function start($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

async function step($: any, agentId: string, index: number) {
  const stream = $.turn.step({ turnId: `turn-${agentId}`, index, model: 'claude-haiku-4-5', messageCount: 1, agentId })
  for await (const _ of stream) {
    // drain the stream so the step completes
  }
}

async function complete($: any, agentId: string, reason: 'answer' | 'aborted' | 'error' = 'answer') {
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: reason === 'aborted', turnId: `turn-${agentId}`, agentId, reason })
}

async function bandTexts($: any, surface: (typeof SURFACES)[number], props = BAND) {
  const ui = await $.ui.mount({ plugin: 'agent-progress', surface, component: 'AbovePrompt', props })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text).filter((t: string) => t !== 'engine')
  await ui.unmount()
  return texts
}

describe('helpers', () => {
  test('median and expected steps', () => {
    expect(median([])).toBe(undefined)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(expectedSteps([])).toBe(15)
    expect(expectedSteps([10, 20])).toBe(15)
    expect(expectedSteps([10, 20, 30])).toBe(20)
  })

  test('estimates cap at 95 until done', () => {
    expect(estimatePercent({ steps: 3, isDone: false }, [10, 10, 10])).toBe(30)
    expect(estimatePercent({ steps: 40, isDone: false }, [10, 10, 10])).toBe(95)
    expect(estimatePercent({ steps: 1, isDone: true })).toBe(100)
  })

  test('history keeps the last 20 runs', () => {
    const full = Array.from({ length: 20 }, (_, i) => i)
    expect(pushHistory(full, 99)).toHaveLength(20)
    expect(pushHistory(full, 99).at(-1)).toBe(99)
  })

  test('formatting', () => {
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(0, 4)).toBe('░░░░')
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(truncate('abcdef', 4)).toBe('abc…')
    expect(shortType('superpowers:code-reviewer')).toBe('code-reviewer')
    expect(shortType('general-purpose')).toBe('general')
  })

  test('layout switches to a summary above four agents', () => {
    const agent = (i: number, isDone = false) => ({ id: `a${i}`, type: 'Explore', description: `task ${i}`, startedAt: 0, steps: i, isDone })
    const four = layout([1, 2, 3, 4].map(i => agent(i)), new Map(), 1000, 80, 8)
    expect(four).toHaveLength(4)
    const six = layout([1, 2, 3, 4, 5, 6].map(i => agent(i, i > 4)), new Map(), 1000, 80, 8)
    expect(six[0]!.text).toContain('6 agents · 2 done')
    expect(six[1]!.text).toContain('Explore ~27%')
    expect(six[1]!.text).toContain('✓')
  })

  test('every line fits the band width', () => {
    const agents = [1, 2].map(i => ({ id: `a${i}`, type: 'superpowers:code-reviewer', description: 'x'.repeat(200), startedAt: 0, steps: 1, isDone: false }))
    for (const columns of [20, 40, 80, 200]) {
      for (const line of layout(agents, new Map(), 0, columns, 8)) expect([...line.text].length <= columns).toBe(true)
    }
  })
})

test('the band is empty while no agent runs', async ($, on) => {
  engine(on)
  await start($)
  for (const surface of SURFACES) expect(await bandTexts($, surface)).toEqual([])
})

test('two agents get a bar each on every surface', async ($, on) => {
  engine(on)
  await start($)
  await $.agent.spawn({ ...SPAWN, description: 'find auth code', subagentType: 'Explore' })
  await $.agent.spawn({ ...SPAWN, description: 'design refactor', subagentType: 'Plan' })
  await step($, 'a1', 0)
  await step($, 'a1', 1)
  for (const surface of SURFACES) {
    const texts = await bandTexts($, surface)
    expect(texts).toHaveLength(2)
    expect(texts[0]).toContain('Explore')
    expect(texts[0]).toContain('find auth code')
    // 2 steps of the default 15
    expect(texts[0]).toContain('~13%')
    expect(texts[1]).toContain('Plan')
  }
})

test('six agents collapse into a summary with chips', async ($, on) => {
  engine(on)
  await start($)
  for (let i = 0; i < 6; i++) await $.agent.spawn({ ...SPAWN, description: `task ${i}`, subagentType: 'Explore' })
  await complete($, 'a1')
  for (const surface of SURFACES) {
    const texts = await bandTexts($, surface)
    expect(texts[0]).toContain('6 agents · 1 done')
    expect(texts[1]).toContain('✓')
  }
})

test('a run that answered is remembered, an aborted one is not', async ($, on) => {
  const writes: Record<string, unknown> = {}
  engine(on, [], writes)
  await start($)
  await $.agent.spawn({ ...SPAWN, description: 'one', subagentType: 'Explore' })
  await $.agent.spawn({ ...SPAWN, description: 'two', subagentType: 'Explore' })
  for (let i = 0; i < 4; i++) await step($, 'a1', i)
  await step($, 'a2', 0)
  await complete($, 'a1', 'answer')
  await complete($, 'a2', 'aborted')
  expect(writes['hist:Explore']).toEqual([4])
})

test('the band hides five seconds after the last agent finishes', async ($, on) => {
  const clock = engine(on)
  await start($)
  await $.agent.spawn({ ...SPAWN, description: 'one', subagentType: 'Explore' })
  await complete($, 'a1')
  expect(await bandTexts($, 'terminal')).toHaveLength(1)
  await clock.advance(6000)
  expect(await bandTexts($, 'terminal')).toEqual([])
})

test('an agent only the list knows about is still shown', async ($, on) => {
  engine(on, [{ id: 'hidden', type: 'Explore', status: 'running', description: 'guarded spawn' }])
  await start($)
  const texts = await bandTexts($, 'terminal')
  expect(texts).toHaveLength(1)
  expect(texts[0]).toContain('guarded spawn')
})

test('teammates are left out', async ($, on) => {
  engine(on, [{ id: 't1', type: 'teammate', status: 'running', description: 'teammate' }])
  await start($)
  await $.agent.spawn({ ...SPAWN, description: 'mate', subagentType: 'general-purpose', isTeammate: true })
  expect(await bandTexts($, 'terminal')).toEqual([])
})
