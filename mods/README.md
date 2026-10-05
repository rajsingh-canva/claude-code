# mods

Personal [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview): plugins of function hooks that draw in and react to a Claude Code session. This folder is also a local plugin marketplace named `raj-mods`.

Tested with Claude Code 2.1.289. Mods need 2.1.287 or later.

| Mod | What it does |
| --- | --- |
| [`agent-progress`](agent-progress/) | Draws a progress bar for each running subagent in the band above the prompt. Above 4 agents it switches to one overall bar plus a percentage per agent. |
| [`eco-meter`](eco-meter/) | Pins a line under the prompt with the water and trees behind this session's spend and the month's `/usage` spend. See its [README](eco-meter/README.md). |
| [`cache-warm`](cache-warm/) | Pins a line under the prompt saying whether the main conversation's prompt cache is still warm, with a countdown and a toast before it goes cold. |

## agent-progress

```
Explore  find auth code    ████████░░░░ ~64%  0:42          up to 4 agents
7 agents · 3 done  ██████████░░░░░░░░  58%                   more than 4
Explore ~92% · Explore ~71% · Plan ~40% · general ~33% · ✓ · ✓ · ✓
```

Subagents report no progress of their own, so each percentage is an estimate: model requests made so far divided by the median request count of that agent type's last 20 runs. It uses 15 requests until a type has 3 runs, stays at or below 95% until the agent finishes and is shown with `~`. Run history is kept in the mod's store, so the estimates improve with use.

The band picks up agents from `agent.spawn` and also checks `$.agent.list()` every second, so agents whose spawn it never saw still show. Teammates are left out. The band hides 5 seconds after the last agent finishes.

## cache-warm

```
🔥 warm · 47:12 left (1h)
🧊 cold (3m ago)
```

The cache counts as warm for one TTL after the main conversation last sent a request or got a response, as Claude Code itself counts it. Subagents don't count, and a response that reported no cache tokens reads as cold. Nothing shows before the first response.

The TTL is 1h on a subscription within plan usage and 5m once you draw on usage credits, so it can change mid-session. After each response the mod reads the last 64 KB of the session transcript and takes the TTL of the latest cache write (`ephemeral_1h_input_tokens` or `ephemeral_5m_input_tokens`). The `ttl` option (`auto`, `5m` or `1h`) fixes it instead.

While you're idle it shows one toast before the cache goes cold: 5 minutes ahead on a 1h TTL, 1 minute ahead on a 5m TTL. A resumed session shows the time left from before.

## Develop

Load the mods for one session straight from this folder. Saving a file reloads it:

```bash
claude --plugin-dir mods/agent-progress --plugin-dir mods/eco-meter --plugin-dir mods/cache-warm
```

Check and test each mod before committing:

```bash
claude plugin validate --strict mods/agent-progress
claude plugin validate --strict mods/eco-meter
claude plugin validate --strict mods/cache-warm
(cd mods/agent-progress && claude plugin test)
(cd mods/eco-meter && claude plugin test)
(cd mods/cache-warm && claude plugin test)
```

Loading a mod writes `.claude-plugin/types/` and a `tsconfig.json` into its folder for editor type checking. Both are git-ignored and are written again on every load.

## Install

Add the marketplace from the main checkout, not a worktree. Its plugins are read in place, so they stop loading if the folder moves:

```text
/plugin marketplace add ~/work/personal/claude-code/mods
/plugin install agent-progress@raj-mods
/plugin install eco-meter@raj-mods
/plugin install cache-warm@raj-mods
```

Edits to this folder reach a session on `/reload-plugins`, with no version bump.

## Add a mod

Create `mods/<name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and the hooks module, then list it in `.claude-plugin/marketplace.json`.
