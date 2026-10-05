// Pure helpers for eco-meter: conversions, parsing and formatting. Nothing
// here touches `$`, so the hooks module can import them and the tests can
// call them directly.

import type { Factors } from './factors.ts'

export type Impact = { usd: number; kwh: number; waterL: number; co2Kg: number; trees: number }

export type MonthUsage = { usedUsd: number; limitUsd?: number }

export type MonthFigure = { impact: Impact; limitUsd: number; isEstimate: boolean; label: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function impact(usd: number, factors: Factors): Impact {
  const spend = Math.max(0, usd)
  const kwh = (spend * factors.whPerUsd) / 1000
  const co2Kg = (kwh * factors.gCo2PerKwh) / 1000
  return { usd: spend, kwh, waterL: kwh * factors.waterLPerKwh, co2Kg, trees: co2Kg / factors.kgCo2PerTreeYear }
}

// The month's spend from the reply /usage itself reads (GET /api/oauth/usage):
// `extra_usage.used_credits` and `monthly_limit`, both in cents
export function parseUsage(body: unknown): MonthUsage | null {
  if (!body || typeof body !== 'object') return null
  const extra = (body as Record<string, unknown>).extra_usage
  if (!extra || typeof extra !== 'object') return null
  const { used_credits: used, monthly_limit: limit } = extra as Record<string, unknown>
  if (typeof used !== 'number' || !Number.isFinite(used)) return null
  return {
    usedUsd: used / 100,
    limitUsd: typeof limit === 'number' && limit > 0 ? limit / 100 : undefined,
  }
}

// 'YYYY-MM' for a time in milliseconds, the key the local ledger groups spend by
export function monthKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(ms: number): string {
  return MONTHS[new Date(ms).getMonth()]!
}

function withCommas(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Two significant figures for small amounts, whole numbers with separators for large ones
export function fmtAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 100) return withCommas(Math.round(n).toString())
  if (n >= 10) return n.toFixed(1)
  if (n >= 0.01) return n.toFixed(2)
  if (n >= 0.001) return n.toFixed(3)
  return '<0.001'
}

export function fmtUsd(n: number): string {
  const amount = Math.max(0, n)
  return amount >= 1000 ? '$' + withCommas(Math.round(amount).toString()) : '$' + amount.toFixed(2)
}

function eco(i: Impact): string {
  return `💧 ${fmtAmount(i.waterL)} L · 🌳 ${fmtAmount(i.trees)} trees`
}

// The line pinned under the prompt
export function statusLine(session: Impact, month?: MonthFigure): string {
  const head = `${eco(session)} · ${fmtUsd(session.usd)} session`
  if (!month) return head
  const est = month.isEstimate ? ' est' : ''
  return `${head} │ ${month.label} ${eco(month.impact)} · ${fmtUsd(month.impact.usd)}/${fmtUsd(month.limitUsd)}${est}`
}

function detail(i: Impact): string {
  return `${fmtAmount(i.kwh)} kWh · ${fmtAmount(i.waterL)} L water · ${fmtAmount(i.co2Kg)} kg CO2 · ${fmtAmount(i.trees)} trees`
}

// What /eco prints
export function breakdown(session: Impact, month: MonthFigure, factors: Factors, source: string): string {
  const pct = month.limitUsd > 0 ? ` (${Math.round((month.impact.usd / month.limitUsd) * 100)}%)` : ''
  return [
    `Session: ${fmtUsd(session.usd)} · ${detail(session)}`,
    `${month.label}: ${fmtUsd(month.impact.usd)} of ${fmtUsd(month.limitUsd)}${pct} · ${detail(month.impact)}`,
    `Month source: ${source}`,
    `Factors: ${factors.whPerUsd} Wh/$ · ${factors.waterLPerKwh} L/kWh · ${factors.gCo2PerKwh} g CO2/kWh · ${factors.kgCo2PerTreeYear} kg CO2 per tree-year`,
    'Trees are tree-years: how many mature trees would take a year to absorb that CO2. Estimates only.',
  ].join('\n')
}
