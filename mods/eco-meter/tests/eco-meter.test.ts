import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { fmtAmount, fmtUsd, impact, monthKey, parseUsage, statusLine } from '../hooks/eco.ts'
import { DEFAULT_FACTORS, readOptions } from '../hooks/factors.ts'

// 15 October 2026, so the month is stable whatever day the tests run
const NOW = new Date(2026, 9, 15, 12).getTime()
const USAGE_REPLY = { extra_usage: { is_enabled: true, monthly_limit: 400000, used_credits: 7334, currency: 'USD' } }

type World = {
  usd: number
  reply?: unknown
  isLoggedIn?: boolean
  statuses: (string | undefined)[]
  fetches: number
}

// The engine beneath the mod: an in-memory clock and store, a session that
// has spent `world.usd`, and a /usage endpoint answering `world.reply`
function engine(on: On, world: World) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: NOW, context: {}, rateLimits: [], cost: { usd: world.usd } } }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.authorize', () => ({ value: world.isLoggedIn === false ? null : { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => {
    world.fetches += 1
    const ok = world.reply !== undefined
    return { value: { status: ok ? 200 : 500, ok, headers: {}, text: ok ? JSON.stringify(world.reply) : 'boom' } }
  })
  on('ui.status', (_$, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

function world(overrides: Partial<World> = {}): World {
  return { usd: 0, reply: USAGE_REPLY, statuses: [], fetches: 0, ...overrides }
}

async function start($: any) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

async function measure($: any, usd: number) {
  await $.session.measure({ context: {}, rateLimits: [], cost: { usd }, changed: [] })
}

// The kit has no toBeCloseTo, so compare floating-point results to 6 places
function near(actual: number, expected: number) {
  expect(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`).toBe(true)
}

describe('helpers', () => {
  test('dollars become energy, water, CO2 and trees', () => {
    const i = impact(100, DEFAULT_FACTORS)
    // 100 $ x 60 Wh/$ = 6 kWh
    near(i.kwh, 6)
    near(i.waterL, 25.2)
    near(i.co2Kg, 2.58)
    near(i.trees, 2.58 / 22)
    expect(impact(-5, DEFAULT_FACTORS).kwh).toBe(0)
  })

  test('the /usage reply is read in cents', () => {
    expect(parseUsage(USAGE_REPLY)).toEqual({ usedUsd: 73.34, limitUsd: 4000 })
    expect(parseUsage({ extra_usage: { used_credits: 50, monthly_limit: null } })).toEqual({ usedUsd: 0.5, limitUsd: undefined })
    expect(parseUsage({ five_hour: {} })).toBe(null)
    expect(parseUsage('nope')).toBe(null)
  })

  test('formatting', () => {
    expect(fmtAmount(0)).toBe('0')
    expect(fmtAmount(0.0042)).toBe('0.004')
    expect(fmtAmount(0.5)).toBe('0.50')
    expect(fmtAmount(12.34)).toBe('12.3')
    expect(fmtAmount(1234.5)).toBe('1,235')
    expect(fmtUsd(3.1)).toBe('$3.10')
    expect(fmtUsd(4000)).toBe('$4,000')
    expect(monthKey(NOW)).toBe('2026-10')
  })

  test('the status line marks an estimated month', () => {
    const session = impact(1, DEFAULT_FACTORS)
    expect(statusLine(session)).toBe('💧 0.25 L · 🌳 0.001 trees · $1.00 session')
    const month = { impact: impact(100, DEFAULT_FACTORS), limitUsd: 4000, isEstimate: true, label: 'Oct' }
    expect(statusLine(session, month)).toContain('│ Oct 💧 25.2 L · 🌳 0.12 trees · $100.00/$4,000 est')
  })

  test('options override the defaults and bad values fall back', () => {
    const { factors, budgetUsd } = readOptions({ budgetUsd: 5000, whPerUsd: -1 })
    expect(budgetUsd).toBe(5000)
    expect(factors.whPerUsd).toBe(60)
  })
})

test('the month comes from /usage when it answers', async ($, on) => {
  const w = world({ usd: 2 })
  engine(on, w)
  await start($)
  const line = w.statuses.at(-1)!
  expect(line).toContain('$2.00 session')
  expect(line).toContain('Oct')
  expect(line).toContain('$73.34/$4,000')
  expect(line).not.toContain('est')
})

test('spend since the last fetch is added to the month', async ($, on) => {
  const w = world({ usd: 2 })
  engine(on, w)
  await start($)
  await measure($, 12)
  // 73.34 from /usage, plus the 10 spent since the fetch
  expect(w.statuses.at(-1)).toContain('$83.34/$4,000')
  expect(w.fetches).toBe(1)
})

test('/usage is asked again after five minutes', async ($, on) => {
  const w = world({ usd: 1 })
  const clock = engine(on, w)
  await start($)
  await measure($, 2)
  expect(w.fetches).toBe(1)
  await clock.advance(5 * 60 * 1000)
  await measure($, 3)
  expect(w.fetches).toBe(2)
})

test('without /usage the month is the local ledger, marked est', async ($, on) => {
  const w = world({ usd: 5, isLoggedIn: false })
  engine(on, w)
  await start($)
  expect(w.statuses.at(-1)).toContain('$5.00/$4,000 est')
  expect(w.fetches).toBe(0)
})

test('a failed fetch falls back to the ledger too', async ($, on) => {
  const w = world({ usd: 5, reply: undefined })
  engine(on, w)
  await start($)
  expect(w.statuses.at(-1)).toContain('est')
})

test('the budget option applies when /usage has no limit', { options: { budgetUsd: 5000 } }, async ($, on) => {
  const w = world({ usd: 1, reply: { extra_usage: { used_credits: 1000 } } })
  engine(on, w)
  await start($)
  expect(w.statuses.at(-1)).toContain('$10.00/$5,000')
})

test('/eco prints the breakdown and its source', async ($, on) => {
  const w = world({ usd: 2 })
  engine(on, w)
  await start($)
  const answer = await $.command.run({ command: 'eco', args: '' } as any)
  expect(answer.text).toContain('Session: $2.00')
  expect(answer.text).toContain('Oct: $73.34 of $4,000 (2%)')
  expect(answer.text).toContain('Month source: /usage')
})

test('/eco probe reports the auth and the reply', async ($, on) => {
  engine(on, world())
  await start($)
  const answer = await $.command.run({ command: 'eco', args: 'probe' } as any)
  expect(answer.text).toContain('authorize: bearer')
  expect(answer.text).toContain('parsed: {"usedUsd":73.34,"limitUsd":4000}')
})
