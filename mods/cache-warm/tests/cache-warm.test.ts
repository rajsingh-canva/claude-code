import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { formatAgo, formatLeft, parseTtl, shouldWarn, statusText } from '../hooks/cache.ts'

const NOW = 1_000_000
const MINUTE = 60 * 1000
const WRITE_1H = '{"usage":{"cache_creation":{"ephemeral_1h_input_tokens":18224,"ephemeral_5m_input_tokens":0}}}'
const WRITE_5M = '{"usage":{"cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":9000}}}'
const CACHED = { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 25000, cache_creation_input_tokens: 1200, model: 'claude-opus-5-5' }
const UNCACHED = { ...CACHED, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type World = { tail: string; usage: typeof CACHED | null; statuses: (string | undefined)[]; toasts: string[] }

// The engine beneath the mod: a clock in memory, a transcript whose tail is
// `world.tail`, and model responses reporting `world.usage`
function engine(on: On, world: World) {
  const clock = mock.clock(on, { now: NOW })
  on('ui.status', (_$, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: world.tail, stderr: '', isStdoutTruncated: false } }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: world.usage }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('classic.Stop', () => ({}))
  on('classic.SessionStart', () => ({}))
  return clock
}

function world(overrides: Partial<World> = {}): World {
  return { tail: WRITE_1H, usage: CACHED, statuses: [], toasts: [], ...overrides }
}

async function start($: any) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

async function step($: any, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain the stream so the step completes
  }
}

async function stop($: any) {
  await $.classic.Stop({ stop_hook_active: false, transcript_path: '/tmp/session.jsonl' })
}

describe('helpers', () => {
  test('the latest cache write sets the TTL', () => {
    expect(parseTtl(WRITE_1H)).toBe('1h')
    expect(parseTtl(WRITE_5M)).toBe('5m')
    expect(parseTtl(`${WRITE_1H}\n${WRITE_5M}`)).toBe('5m')
    // Transcripts write the two fields in either order
    expect(parseTtl('{"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4414}}')).toBe('1h')
    // A response that wrote nothing leaves the TTL as it was
    expect(parseTtl(`${WRITE_5M}\n{"cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}`)).toBe('5m')
    expect(parseTtl('{"type":"user"}')).toBe(undefined)
  })

  test('formatting', () => {
    expect(formatLeft(47 * MINUTE + 12_000)).toBe('47:12')
    expect(formatLeft(60 * MINUTE)).toBe('1:00:00')
    expect(formatLeft(500)).toBe('0:01')
    expect(formatAgo(30_000)).toBe('just now')
    expect(formatAgo(3 * MINUTE)).toBe('3m ago')
    expect(formatAgo(125 * MINUTE)).toBe('2h ago')
  })

  test('status text', () => {
    expect(statusText({ hasCache: false, ttl: '1h' }, NOW)).toBe(undefined)
    expect(statusText({ lastActivityAt: NOW, hasCache: true, ttl: '1h' }, NOW + 12 * MINUTE + 48_000)).toBe('🔥 warm · 47:12 left (1h)')
    expect(statusText({ lastActivityAt: NOW, hasCache: true, ttl: '5m' }, NOW + 8 * MINUTE)).toBe('🧊 cold (3m ago)')
    expect(statusText({ lastActivityAt: NOW, hasCache: false, ttl: '1h' }, NOW)).toBe('🧊 cold (no cache reported)')
  })

  test('warns once, only while idle and close to expiry', () => {
    const state = { lastActivityAt: NOW, hasCache: true, ttl: '5m' as const }
    expect(shouldWarn(state, NOW + 2 * MINUTE, false, undefined)).toBe(false)
    expect(shouldWarn(state, NOW + 4.5 * MINUTE, false, undefined)).toBe(true)
    expect(shouldWarn(state, NOW + 4.5 * MINUTE, true, undefined)).toBe(false)
    expect(shouldWarn(state, NOW + 4.5 * MINUTE, false, NOW)).toBe(false)
    expect(shouldWarn(state, NOW + 6 * MINUTE, false, undefined)).toBe(false)
  })
})

test('nothing shows before the first response', async ($, on) => {
  const w = world()
  const clock = engine(on, w)
  await start($)
  await clock.advance(2000)
  expect(w.statuses.every(s => s === undefined)).toBe(true)
})

test('a main-conversation response shows warm with the time left', async ($, on) => {
  const w = world()
  engine(on, w)
  await start($)
  await step($)
  expect(w.statuses.at(-1)).toBe('🔥 warm · 1:00:00 left (1h)')
})

test('subagent requests do not count', async ($, on) => {
  const w = world()
  engine(on, w)
  await start($)
  await step($, 'agent-1')
  expect(w.statuses.every(s => s === undefined)).toBe(true)
})

test('a 5m cache write in the transcript switches the TTL', async ($, on) => {
  const w = world({ tail: WRITE_5M })
  const clock = engine(on, w)
  await start($)
  await step($)
  await stop($)
  expect(w.statuses.at(-1)).toBe('🔥 warm · 5:00 left (5m)')
  await clock.advance(6 * MINUTE)
  expect(w.statuses.at(-1)).toBe('🧊 cold (1m ago)')
})

test('the ttl option overrides the transcript', { options: { ttl: '5m' } }, async ($, on) => {
  const w = world({ tail: WRITE_1H })
  engine(on, w)
  await start($)
  await step($)
  await stop($)
  expect(w.statuses.at(-1)).toBe('🔥 warm · 5:00 left (5m)')
})

test('one toast near expiry while idle', { options: { ttl: '5m' } }, async ($, on) => {
  const w = world()
  const clock = engine(on, w)
  await start($)
  await step($)
  await clock.advance(4.5 * MINUTE)
  await clock.advance(20_000)
  expect(w.toasts).toEqual(['Prompt cache goes cold in 1 min. Send a message to keep it warm.'])
})

test('no toast while a turn is running', { options: { ttl: '5m' } }, async ($, on) => {
  const w = world()
  const clock = engine(on, w)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'busy' })
  await step($)
  await clock.advance(4.5 * MINUTE)
  expect(w.toasts).toEqual([])
})

test('a resumed conversation shows the time left from before', async ($, on) => {
  const w = world()
  engine(on, w)
  await start($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, transcript_path: '/tmp/session.jsonl' })
  expect(w.statuses.at(-1)).toBe('🔥 warm · 50:00 left (1h)')
})

test('/clear hides the line', async ($, on) => {
  const w = world()
  engine(on, w)
  await start($)
  await step($)
  await $.classic.SessionStart({ source: 'clear' })
  expect(w.statuses.at(-1)).toBe(undefined)
})

test('a response with no cache tokens reads cold', async ($, on) => {
  const w = world({ usage: UNCACHED })
  engine(on, w)
  await start($)
  await step($)
  expect(w.statuses.at(-1)).toBe('🧊 cold (no cache reported)')
})
