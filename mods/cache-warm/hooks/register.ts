import type { EngineInterface, Register } from 'claude-code'

import { type CacheState, parseTtl, shouldWarn, statusText, type Ttl, warningText } from './cache.ts'

// Bytes read from the end of the transcript to find the latest cache write;
// $.fs.read has no offset and transcripts outgrow its 4 MiB limit
const TAIL_BYTES = '65536'

// Defaults to 1h, what a subscription within plan usage writes, until the transcript says otherwise
const state: CacheState = { hasCache: false, ttl: '1h' }
// Set when the ttl option fixes the TTL, which turns detection off
let configuredTtl: Ttl | undefined
// Turns in progress; the warning waits while any runs
const activeTurns = new Set<string>()
// The activity the last warning was for, so each idle stretch warns once
let warnedAt: number | undefined

async function render($: EngineInterface) {
  const now = await $.clock.now()
  if (shouldWarn(state, now, activeTurns.size > 0, warnedAt)) {
    warnedAt = state.lastActivityAt
    $.ui.toast(warningText(state.ttl))
  }
  $.ui.status(statusText(state, now))
}

// Reads the TTL of the latest cache write from the end of the transcript
async function detectTtl($: EngineInterface, transcriptPath: string) {
  if (configuredTtl !== undefined || !transcriptPath) return
  try {
    const tail = await $.process.run(['tail', '-c', TAIL_BYTES, transcriptPath])
    const ttl = tail.exitCode === 0 ? parseTtl(tail.stdout) : undefined
    if (ttl) state.ttl = ttl
  } catch {
    // Keep the last TTL when the transcript can't be read
  }
}

export const register: Register = (on, options) => {
  configuredTtl = options.ttl === '5m' || options.ttl === '1h' ? options.ttl : undefined
  if (configuredTtl) state.ttl = configuredTtl

  // Counts the time left down once a second
  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => {
      void render($)
    })
    return next(e)
  })

  // Each request and response of the main conversation keeps its cache warm
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    if (state.lastActivityAt !== undefined) state.lastActivityAt = await $.clock.now()
    const result = yield* next(e)
    state.lastActivityAt = await $.clock.now()
    if (result.usage) state.hasCache = result.usage.cache_read_input_tokens + result.usage.cache_creation_input_tokens > 0
    await render($)
    return result
  })

  on('turn.start', async ($, e, next) => {
    activeTurns.add(e.turnId)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    activeTurns.delete(e.turnId)
    return next(e)
  })

  // Claude finished responding: the transcript now holds the latest cache write
  on('classic.Stop', async ($, e, next) => {
    await detectTtl($, e.transcript_path)
    await render($)
    return next(e)
  })

  // A resumed conversation's cache may still be warm from before
  on('classic.SessionStart', { source: ['resume', 'fork'] }, async ($, e, next) => {
    if (typeof e.seconds_since_last_response === 'number') {
      state.lastActivityAt = (await $.clock.now()) - e.seconds_since_last_response * 1000
      state.hasCache = true
      await detectTtl($, e.transcript_path)
    }
    await render($)
    return next(e)
  })

  // /clear starts a conversation with nothing cached yet
  on('classic.SessionStart', { source: 'clear' }, async ($, e, next) => {
    state.lastActivityAt = undefined
    state.hasCache = false
    warnedAt = undefined
    $.ui.status(undefined)
    return next(e)
  })
}
