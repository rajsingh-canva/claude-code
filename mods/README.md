# mods

Personal [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview): plugins of function hooks that draw in and react to a Claude Code session. This folder is also a local plugin marketplace named `raj-mods`.

Tested with Claude Code 2.1.289. Mods need 2.1.287 or later.

| Mod | What it does |
| --- | --- |
| [`agent-progress`](agent-progress/) | Draws a progress bar for each running subagent in the band above the prompt. Above 4 agents it switches to one overall bar plus a percentage per agent. |
| [`eco-meter`](eco-meter/) | Pins a line under the prompt with the water and trees behind this session's spend and the month's `/usage` spend. See its [README](eco-meter/README.md). |

## agent-progress

```
Explore  find auth code    ████████░░░░ ~64%  0:42          up to 4 agents
7 agents · 3 done  ██████████░░░░░░░░  58%                   more than 4
Explore ~92% · Explore ~71% · Plan ~40% · general ~33% · ✓ · ✓ · ✓
```

Subagents report no progress of their own, so each percentage is an estimate: model requests made so far divided by the median request count of that agent type's last 20 runs. It uses 15 requests until a type has 3 runs, stays at or below 95% until the agent finishes and is shown with `~`. Run history is kept in the mod's store, so the estimates improve with use.

The band picks up agents from `agent.spawn` and also checks `$.agent.list()` every second, so agents whose spawn it never saw still show. Teammates are left out. The band hides 5 seconds after the last agent finishes.

## Develop

Load the mods for one session straight from this folder. Saving a file reloads it:

```bash
claude --plugin-dir mods/agent-progress --plugin-dir mods/eco-meter
```

Check and test each mod before committing:

```bash
claude plugin validate --strict mods/agent-progress
claude plugin validate --strict mods/eco-meter
(cd mods/agent-progress && claude plugin test)
(cd mods/eco-meter && claude plugin test)
```

Loading a mod writes `.claude-plugin/types/` and a `tsconfig.json` into its folder for editor type checking. Both are git-ignored and are written again on every load.

## Install

Add the marketplace from the main checkout, not a worktree. Its plugins are read in place, so they stop loading if the folder moves:

```text
/plugin marketplace add ~/work/personal/claude-code/mods
/plugin install agent-progress@raj-mods
/plugin install eco-meter@raj-mods
```

Edits to this folder reach a session on `/reload-plugins`, with no version bump.

## Add a mod

Create `mods/<name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and the hooks module, then list it in `.claude-plugin/marketplace.json`.
