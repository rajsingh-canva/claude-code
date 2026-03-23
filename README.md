# claude-code

Personal Claude Code toolkit — tmux multi-agent workflows, SDK orchestrator, and custom skills.

## Quick Start

```bash
# Clone and set up
git clone https://github.com/rajsingh-canva/claude-code.git ~/Work/claude-code
cd ~/Work/claude-code
./setup.sh   # adds to PATH, sets env vars, installs Python deps

# Native agent teams (each agent gets its own tmux pane)
claude --teammate-mode tmux

# Shell templates
cca launch code-review "Review the latest commit" ~/Work/project
cca launch research "How does the auth module work?" ~/Work/project

# SDK orchestrator
cd ~/Work/claude-code/orchestrator
uv run main.py "Analyze security of auth module" ~/Work/project --workers 3
```

## What's Inside

```
claude-code/
├── bin/                    # cca CLI tools
│   ├── cca                 # Main entry point (launch, dash, kill, list, spawn)
│   ├── cca-spawn           # Spawn a headless Claude agent in a tmux pane
│   ├── cca-dash            # Monitoring dashboard (status table + live logs)
│   └── cca-kill            # Clean teardown of agent sessions
├── lib/                    # Shared bash helpers
│   ├── tmux-helpers.sh     # Session/pane manipulation
│   ├── stream-parser.sh    # jq filters for stream-json output
│   └── agent-registry.sh   # Track running agents with status table
├── templates/              # Workflow templates
│   ├── code-review.sh      # 2-pane: code reviewer + security reviewer
│   ├── research.sh         # 3-pane: researcher + analyst + synthesizer
│   └── custom.sh           # Generic N-pane (one per prompt)
├── orchestrator/           # Python SDK multi-agent orchestrator
│   └── main.py             # Lead agent + parallel workers + synthesis
├── prompts/                # System prompts for agent roles
│   └── orchestrator.md     # Teaches the lead agent how to delegate
├── .skills/                # Custom Claude Code skills
│   ├── research-notes/     # Research via NotebookLM
│   ├── obsidian-cli/       # Obsidian vault CLI operations
│   ├── obsidian-zettelkasten/ # Zettelkasten note-taking method
│   └── windows-vm-builder/ # Windows 11 golden images with Packer
├── setup.sh                # One-command setup for new machines
└── .gitignore
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `cca launch <template> [args]` | Launch a workflow template (`code-review`, `research`, `custom`) |
| `cca dash [session]` | Open monitoring dashboard for an active session |
| `cca kill [session \| --all]` | Tear down agent sessions |
| `cca list` | List active agent sessions |
| `cca spawn --session <s> --pane <p> --name <n> --prompt <prompt>` | Spawn a single headless agent in a tmux pane |

### cca-spawn options

| Flag | Description |
|------|-------------|
| `--session` | Target tmux session name |
| `--pane` | Target pane (e.g., `0.1`) |
| `--name` | Agent name (used in logs) |
| `--prompt` | Task prompt for the agent |
| `--project` | Project directory to give the agent access to |
| `--tools` | Restrict allowed tools (e.g., `"Read Grep Glob"`) |
| `--model` | Model override (`sonnet`, `opus`, `haiku`) |
| `--budget` | Max spend in USD (`--max-budget-usd`) |
| `--max-turns` | Limit agentic turns |

## SDK Orchestrator

A Python-based multi-agent orchestrator using the Claude Code SDK. Runs a 3-phase workflow:

1. **Plan** — Lead agent (opus) breaks the task into parallel subtasks
2. **Execute** — Worker agents (sonnet) run subtasks concurrently
3. **Synthesize** — Lead agent combines worker outputs into a final report

```bash
cd ~/Work/claude-code/orchestrator
uv run main.py "task description" /path/to/project [--workers N] [--model MODEL]
```

## Skills

| Skill | Description |
|-------|-------------|
| **research-notes** | Research and summarize URLs, YouTube videos, and PDFs into structured notes using NotebookLM |
| **obsidian-cli** | Programmatic access to Obsidian vault via CLI — search, create, edit, tag management |
| **obsidian-zettelkasten** | Zettelkasten note-taking in Obsidian — one idea per note, link-based organization |
| **windows-vm-builder** | Build Windows 11 golden images on macOS using Packer + Parallels Desktop |

## Setup on a New Machine

### Prerequisites

```bash
brew install tmux jq
brew install uv   # or: curl -LsSf https://astral.sh/uv/install.sh | sh
# Claude Code CLI must be installed: https://docs.anthropic.com/en/docs/claude-code
```

### Install

```bash
git clone https://github.com/rajsingh-canva/claude-code.git ~/Work/claude-code
cd ~/Work/claude-code
./setup.sh
source ~/.zshrc
```

`setup.sh` handles:
- Adding `bin/` to your PATH
- Setting `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Installing Python dependencies for the orchestrator
- Creating runtime directories

### Verify

```bash
cca --help                    # CLI works
claude --teammate-mode tmux   # Native agent teams work
```
