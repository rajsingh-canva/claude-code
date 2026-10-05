# eco-meter

Pins a line under the Claude Code prompt that turns spend into water and trees, for this session and for the month so far:

```
💧 0.76 L · 🌳 0.004 trees · $3.02 session │ Oct 💧 18.9 L · 🌳 0.09 trees · $74.96/$4,000
```

`/eco` prints the full breakdown: dollars, kWh, litres, kg of CO2 and trees for both, the factors in use and where the month figure came from. `/eco probe` prints the raw reply from `/usage` for troubleshooting.

## Where the numbers come from

- **Session:** `$.session.usage().cost.usd`, the same figure as the Session block in `/usage`. It's computed at list price and resets on `/clear`.
- **Month:** the usage-credits spend and monthly limit that `/usage` shows. It's read from the endpoint `/usage` itself calls (`GET https://api.anthropic.com/api/oauth/usage`, `extra_usage.used_credits` and `monthly_limit`, in cents).
  - The mod asks with `$.session.authorize()`, so the credential never reaches the mod.
  - It asks at most every 5 minutes. Between asks, it adds what this session has spent since.
- **Fallback:** the endpoint is undocumented and can change. When it can't be read, the month is the sum of every session's spend this month recorded by this mod on this Mac. The line then ends in `est`. The `budgetUsd` option (default $4,000) is the limit shown when `/usage` reports none.

## From dollars to water and trees

Spend is the proxy for compute. Bigger models cost more per token because they use more compute, and cache reads cost about a tenth of fresh input for the same reason. So:

1. **Energy** (kWh) = spend × `whPerUsd` ÷ 1000
2. **Water** (L) = kWh × `waterLPerKwh`
3. **CO2** (kg) = kWh × `gCo2PerKwh` ÷ 1000
4. **Trees** = kg CO2 ÷ `kgCo2PerTreeYear`, the number of mature trees that would take a year to absorb it

| Option | Default | How it was derived |
| --- | --- | --- |
| `whPerUsd` | 60 Wh/$ | Epoch AI estimates about 0.3 Wh for a typical 500-token GPT-4o reply, data-centre overhead included: 0.0006 Wh per output token. At Claude Sonnet 5.5's list price of $10 per million output tokens, that is 0.0006 Wh ÷ $0.00001 = 60 Wh per dollar. |
| `waterLPerKwh` | 4.2 L/kWh | Li et al. give U.S. averages of 0.55 L/kWh of on-site cooling water and 3.142 L/kWh of off-site water for electricity generation at a PUE of 1.17: 0.55 + 1.17 × 3.142 = 4.23 L/kWh. |
| `gCo2PerKwh` | 430 g/kWh | The U.S. EIA reports 0.81 lb (367 g) of CO2 per kWh of 2023 U.S. generation. Times the same PUE of 1.17 for data-centre overhead: 430 g/kWh. |
| `kgCo2PerTreeYear` | 22 kg | The European Environment Agency: a mature tree takes up about 22 kg of CO2 a year. |
| `budgetUsd` | 4,000 | Monthly limit shown when `/usage` reports none. |

These are order-of-magnitude estimates. Per-token energy varies several-fold by model, hardware and batch size. Water and carbon vary by region and by whether a provider buys renewable energy, and the tree figure varies widely by species and climate. Change any factor with `/plugin configure eco-meter@raj-mods`, or under `pluginConfigs` in `~/.claude/settings.json` (keyed `eco-meter@inline` when loaded with `--plugin-dir`).

## Sources

- Epoch AI, [How much energy does ChatGPT use?](https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use) (2025)
- Anthropic, [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Li, Yang, Islam and Ren, [Making AI Less "Thirsty": Uncovering and Addressing the Secret Water Footprint of AI Models](https://arxiv.org/abs/2304.03271), arXiv:2304.03271v5 (2025)
- U.S. Energy Information Administration, [How much carbon dioxide is produced per kilowatthour of U.S. electricity generation?](https://www.eia.gov/tools/faqs/faq.php?id=74&t=11)
- European Environment Agency, [Forests, health and climate change](https://www.eea.europa.eu/articles/forests-health-and-climate-change)
- For comparison: Google, [Measuring the environmental impact of delivering AI at Google scale](https://arxiv.org/abs/2508.15734) (2025) reports 0.24 Wh and 0.26 mL of on-site water for a median Gemini text prompt.
