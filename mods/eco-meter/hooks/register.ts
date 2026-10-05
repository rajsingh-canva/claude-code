import type { EngineInterface, Register } from 'claude-code'

import { breakdown, impact, type MonthFigure, type MonthUsage, monthKey, monthLabel, parseUsage, statusLine } from './eco.ts'
import { type Factors, readOptions } from './factors.ts'

// The endpoint /usage reads its usage-credits row from. Undocumented, so any
// failure falls back to the local ledger below.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const USAGE_HEADERS = { 'anthropic-beta': 'oauth-2025-04-20' }
const REFETCH_MS = 5 * 60 * 1000
// One key per session per month, so sessions never overwrite each other's spend
const LEDGER_PREFIX = 'spend:'

type Fetched = MonthUsage & { fetchedAt: number; sessionUsdAtFetch: number }

let factors: Factors
let budgetUsd: number
let sessionUsd = 0
let fetched: Fetched | undefined
let lastFetchAt = Number.NEGATIVE_INFINITY
let lastFetchNote = 'not fetched yet'

async function fetchUsage($: EngineInterface): Promise<{ usage: MonthUsage | null; note: string; text?: string }> {
  const auth = await $.session.authorize()
  if (!auth) return { usage: null, note: 'no first-party Claude login to ask with' }
  const res = await $.http.fetch(USAGE_URL, { auth: auth.handle, headers: USAGE_HEADERS })
  if (!res.ok) return { usage: null, note: `/usage endpoint answered HTTP ${res.status}`, text: res.text }
  let body: unknown
  try {
    body = JSON.parse(res.text)
  } catch {
    return { usage: null, note: '/usage endpoint answered something other than JSON', text: res.text }
  }
  const usage = parseUsage(body)
  return { usage, note: usage ? 'ok' : '/usage endpoint reported no usage-credits spend', text: res.text }
}

async function refetch($: EngineInterface, now: number) {
  lastFetchAt = now
  try {
    const { usage, note } = await fetchUsage($)
    lastFetchNote = note
    fetched = usage ? { ...usage, fetchedAt: now, sessionUsdAtFetch: sessionUsd } : undefined
  } catch (error) {
    lastFetchNote = `/usage endpoint unreachable: ${error instanceof Error ? error.message : String(error)}`
    fetched = undefined
  }
}

// Records this session's spend under the current month
async function writeLedger($: EngineInterface, now: number) {
  if (sessionUsd <= 0) return
  await $.store.set(`${LEDGER_PREFIX}${monthKey(now)}:${await $.session.id()}`, sessionUsd)
}

async function ledgerTotal($: EngineInterface, now: number): Promise<number> {
  const prefix = `${LEDGER_PREFIX}${monthKey(now)}:`
  let total = 0
  for (const key of await $.store.keys()) {
    if (!key.startsWith(prefix)) continue
    const usd = await $.store.get(key)
    if (typeof usd === 'number' && Number.isFinite(usd)) total += usd
  }
  return total
}

// Drops ledger entries from earlier months
async function pruneLedger($: EngineInterface, now: number) {
  const current = `${LEDGER_PREFIX}${monthKey(now)}:`
  for (const key of await $.store.keys()) {
    if (key.startsWith(LEDGER_PREFIX) && !key.startsWith(current)) await $.store.delete(key)
  }
}

// The month so far: the last /usage figure plus what this session has spent
// since, or the local ledger when /usage could not be read
async function monthFigure($: EngineInterface, now: number): Promise<MonthFigure> {
  const label = monthLabel(now)
  if (fetched && monthKey(fetched.fetchedAt) === monthKey(now)) {
    const usd = fetched.usedUsd + Math.max(0, sessionUsd - fetched.sessionUsdAtFetch)
    return { impact: impact(usd, factors), limitUsd: fetched.limitUsd ?? budgetUsd, isEstimate: false, label }
  }
  return { impact: impact(await ledgerTotal($, now), factors), limitUsd: budgetUsd, isEstimate: true, label }
}

function sourceText(month: MonthFigure, now: number): string {
  if (!month.isEstimate) return `/usage, fetched ${Math.round((now - lastFetchAt) / 60000)} min ago`
  return `local estimate from this Mac's sessions (${lastFetchNote})`
}

// Updates the session spend, the ledger and the month figure, then the status line
async function refresh($: EngineInterface, usd?: number) {
  const now = await $.clock.now()
  sessionUsd = usd ?? (await $.session.usage()).cost?.usd ?? sessionUsd
  await writeLedger($, now)
  if (now - lastFetchAt >= REFETCH_MS) await refetch($, now)
  $.ui.status(statusLine(impact(sessionUsd, factors), await monthFigure($, now)))
}

async function probe($: EngineInterface): Promise<string> {
  const lines: string[] = []
  const auth = await $.session.authorize()
  lines.push(`authorize: ${auth ? auth.kind : 'null'}`)
  try {
    const { usage, note, text } = await fetchUsage($)
    lines.push(`fetch: ${note}`)
    lines.push(`parsed: ${JSON.stringify(usage)}`)
    if (text !== undefined) {
      let shown = text
      try {
        const body = JSON.parse(text) as Record<string, unknown>
        shown = JSON.stringify({ keys: Object.keys(body), extra_usage: body.extra_usage })
      } catch {
        // not JSON: show the start of the text
      }
      lines.push(`reply: ${shown.slice(0, 600)}`)
    }
  } catch (error) {
    lines.push(`fetch threw: ${error instanceof Error ? error.message : String(error)}`)
  }
  const usage = await $.session.usage()
  lines.push(`session cost: ${JSON.stringify(usage.cost)}`)
  lines.push(`rateLimits: ${JSON.stringify(usage.rateLimits)}`)
  return lines.join('\n')
}

export const register: Register = (on, options) => {
  const config = readOptions(options)
  factors = config.factors
  budgetUsd = config.budgetUsd

  on('session.start', async ($, e, next) => {
    await pruneLedger($, await $.clock.now())
    await refresh($)
    try {
      await $.command.register({ name: 'eco', description: 'Water and trees for this session and month', argumentHint: '[probe]' })
    } catch {
      // Another plugin already owns /eco
    }
    return next(e)
  })

  // After each main-thread turn, with the session's cost
  on('session.measure', async ($, e, next) => {
    await refresh($, e.cost?.usd)
    return next(e)
  })

  // session.measure skips subagent turns, so catch their spend here
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) await refresh($)
    return next(e)
  })

  // /clear, /resume and /branch start the session cost again
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'eco' }, async ($, e) => {
    if (e.args.trim() === 'probe') return { text: await probe($) }
    await refresh($)
    const now = await $.clock.now()
    const month = await monthFigure($, now)
    return { text: breakdown(impact(sessionUsd, factors), month, factors, sourceText(month, now)) }
  })
}
