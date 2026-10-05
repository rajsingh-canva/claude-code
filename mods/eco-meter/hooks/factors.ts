// Default conversion factors. Each one can be overridden in the plugin's
// userConfig; README.md shows how each default was derived.

export type Factors = {
  // Watt-hours of inference energy per US dollar of list-price spend
  whPerUsd: number
  // Litres of water consumed per kWh of inference energy (on-site cooling plus electricity generation)
  waterLPerKwh: number
  // Grams of CO2 emitted per kWh of inference energy
  gCo2PerKwh: number
  // Kilograms of CO2 one mature tree takes up in a year
  kgCo2PerTreeYear: number
}

export const DEFAULT_FACTORS: Factors = {
  // Epoch AI: ~0.3 Wh per 500-token GPT-4o reply, so 0.0006 Wh per output token,
  // priced at Claude Sonnet 5.5's $10 per million output tokens
  whPerUsd: 60,
  // Li et al., Making AI Less "Thirsty": U.S. average 0.55 L/kWh on-site + PUE 1.17 x 3.142 L/kWh off-site
  waterLPerKwh: 4.2,
  // U.S. EIA 2023 grid average 0.81 lb (367 g) CO2/kWh, x PUE 1.17 for data-centre overhead
  gCo2PerKwh: 430,
  // European Environment Agency: a mature tree takes up about 22 kg CO2 a year
  kgCo2PerTreeYear: 22,
}

export const DEFAULT_BUDGET_USD = 4000

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

// Reads the factors and budget from the plugin's options, falling back to the defaults
export function readOptions(options: Readonly<Record<string, unknown>>): { factors: Factors; budgetUsd: number } {
  return {
    factors: {
      whPerUsd: positive(options.whPerUsd, DEFAULT_FACTORS.whPerUsd),
      waterLPerKwh: positive(options.waterLPerKwh, DEFAULT_FACTORS.waterLPerKwh),
      gCo2PerKwh: positive(options.gCo2PerKwh, DEFAULT_FACTORS.gCo2PerKwh),
      kgCo2PerTreeYear: positive(options.kgCo2PerTreeYear, DEFAULT_FACTORS.kgCo2PerTreeYear),
    },
    budgetUsd: positive(options.budgetUsd, DEFAULT_BUDGET_USD),
  }
}
