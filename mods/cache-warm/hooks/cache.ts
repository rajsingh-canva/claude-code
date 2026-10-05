// Pure helpers for cache-warm. Nothing here touches `$`, so the hooks module
// can import them and the tests can call them directly.

export type Ttl = '5m' | '1h'

export type CacheState = {
  // When the main conversation last sent a request or got a response; absent before the first
  lastActivityAt?: number
  // False when the last response reported no cache tokens
  hasCache: boolean
  ttl: Ttl
}

const MINUTE = 60 * 1000

export function ttlMs(ttl: Ttl): number {
  return ttl === '1h' ? 60 * MINUTE : 5 * MINUTE
}

// How long before expiry the warning toast fires
export function warnBeforeMs(ttl: Ttl): number {
  return ttl === '1h' ? 5 * MINUTE : MINUTE
}

// The TTL of the latest cache write in a stretch of transcript JSONL, from
// `"cache_creation":{"ephemeral_1h_input_tokens":N,"ephemeral_5m_input_tokens":M}`
export function parseTtl(transcript: string): Ttl | undefined {
  let ttl: Ttl | undefined
  for (const match of transcript.matchAll(/"cache_creation":\{([^}]*)\}/g)) {
    const fields = match[1]!
    const hour = Number(/"ephemeral_1h_input_tokens":(\d+)/.exec(fields)?.[1] ?? 0)
    const fiveMinutes = Number(/"ephemeral_5m_input_tokens":(\d+)/.exec(fields)?.[1] ?? 0)
    if (hour > 0) ttl = '1h'
    else if (fiveMinutes > 0) ttl = '5m'
  }
  return ttl
}

function twoDigits(n: number): string {
  return String(n).padStart(2, '0')
}

// 47:12, or 1:00:00 from an hour up
export function formatLeft(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${twoDigits(rest)}` : `${minutes}:${twoDigits(rest)}`
}

export function formatAgo(ms: number): string {
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

export function remainingMs(state: CacheState, now: number): number | undefined {
  return state.lastActivityAt === undefined ? undefined : state.lastActivityAt + ttlMs(state.ttl) - now
}

// The status line, or undefined before the first response so nothing shows
export function statusText(state: CacheState, now: number): string | undefined {
  const left = remainingMs(state, now)
  if (left === undefined) return undefined
  if (!state.hasCache) return '🧊 cold (no cache reported)'
  return left > 0 ? `🔥 warm · ${formatLeft(left)} left (${state.ttl})` : `🧊 cold (${formatAgo(-left)})`
}

// Warn once per stretch of idle time, while the cache is warm but about to expire
export function shouldWarn(state: CacheState, now: number, isBusy: boolean, warnedAt: number | undefined): boolean {
  const left = remainingMs(state, now)
  if (left === undefined || isBusy || !state.hasCache || warnedAt === state.lastActivityAt) return false
  return left > 0 && left <= warnBeforeMs(state.ttl)
}

export function warningText(ttl: Ttl): string {
  return `Prompt cache goes cold in ${ttl === '1h' ? '5 min' : '1 min'}. Send a message to keep it warm.`
}
