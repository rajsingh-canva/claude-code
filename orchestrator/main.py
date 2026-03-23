"""
Multi-agent orchestrator using Claude Code SDK.

Launches a lead agent that breaks tasks into subtasks and delegates
to worker agents. Can optionally run in tmux for visual monitoring.

Usage:
    uv run main.py "Analyze the codebase" ~/Work/project
    uv run main.py "Review security of auth module" ~/Work/project --workers 3
    uv run main.py "Find all TODOs" ~/Work/project --model sonnet
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from claude_code_sdk import Claude, ClaudeCodeOptions, query


async def run_worker(name: str, task: str, project_dir: str, model: str = "sonnet") -> str:
    """Run a single worker agent and return its output."""
    print(f"[{name}] Starting: {task[:80]}...")

    options = ClaudeCodeOptions(
        model=model,
        system_prompt=f"You are worker agent '{name}'. Complete the assigned task thoroughly and concisely.",
        allowed_tools=["Read", "Grep", "Glob", "Bash"],
        cwd=project_dir,
        max_turns=20,
    )

    result_text = []
    async for message in query(prompt=task, options=options):
        if message.type == "text":
            result_text.append(message.text)

    output = "\n".join(result_text)
    print(f"[{name}] Done ({len(output)} chars)")
    return output


async def run_orchestrator(
    task: str,
    project_dir: str,
    num_workers: int = 2,
    model: str = "sonnet",
    lead_model: str = "opus",
):
    """Run a lead agent that delegates to worker agents."""

    # Phase 1: Planning — lead agent breaks task into subtasks
    print(f"\n=== Phase 1: Planning ===")
    print(f"Task: {task}")
    print(f"Project: {project_dir}")
    print(f"Workers: {num_workers}\n")

    planning_prompt = f"""Break this task into exactly {num_workers} independent subtasks that can be worked on in parallel.

Task: {task}
Project directory: {project_dir}

Output ONLY a JSON array of subtask descriptions, one per worker. Example:
["Subtask 1 description", "Subtask 2 description"]

Be specific — each subtask should be self-contained and actionable."""

    plan_options = ClaudeCodeOptions(
        model=lead_model,
        system_prompt="You are a lead orchestrator agent. Output only valid JSON.",
        max_turns=5,
    )

    plan_text = []
    async for message in query(prompt=planning_prompt, options=plan_options):
        if message.type == "text":
            plan_text.append(message.text)

    plan_output = "\n".join(plan_text)

    # Parse subtasks from JSON
    try:
        # Find JSON array in output
        start = plan_output.index("[")
        end = plan_output.rindex("]") + 1
        subtasks = json.loads(plan_output[start:end])
    except (ValueError, json.JSONDecodeError):
        print(f"Failed to parse plan. Raw output:\n{plan_output}")
        subtasks = [task]  # Fallback: single task

    print(f"Subtasks: {json.dumps(subtasks, indent=2)}\n")

    # Phase 2: Execution — run workers in parallel
    print(f"=== Phase 2: Parallel Execution ({len(subtasks)} workers) ===\n")

    worker_tasks = []
    for i, subtask in enumerate(subtasks[:num_workers]):
        name = f"worker-{i+1}"
        worker_tasks.append(run_worker(name, subtask, project_dir, model))

    results = await asyncio.gather(*worker_tasks, return_exceptions=True)

    # Collect results
    worker_outputs = {}
    for i, result in enumerate(results):
        name = f"worker-{i+1}"
        if isinstance(result, Exception):
            worker_outputs[name] = f"ERROR: {result}"
            print(f"[{name}] Failed: {result}")
        else:
            worker_outputs[name] = result

    # Phase 3: Synthesis — lead agent combines results
    print(f"\n=== Phase 3: Synthesis ===\n")

    synthesis_prompt = f"""You were given this task: {task}

It was broken into subtasks and assigned to workers. Here are their results:

{json.dumps(worker_outputs, indent=2)}

Synthesize these results into a single, coherent response. Include:
1. Summary of findings
2. Key details from each worker
3. Any conflicts or gaps between worker outputs
4. Recommendations or next steps"""

    synth_options = ClaudeCodeOptions(
        model=lead_model,
        system_prompt="You are a lead orchestrator synthesizing worker outputs into a final report.",
        max_turns=5,
    )

    print("--- Final Report ---\n")
    async for message in query(prompt=synthesis_prompt, options=synth_options):
        if message.type == "text":
            print(message.text, end="", flush=True)
    print("\n\n--- End Report ---")


def main():
    parser = argparse.ArgumentParser(description="Multi-agent orchestrator using Claude Code SDK")
    parser.add_argument("task", help="Task to accomplish")
    parser.add_argument("project_dir", help="Project directory for agents to work in")
    parser.add_argument("--workers", type=int, default=2, help="Number of worker agents (default: 2)")
    parser.add_argument("--model", default="sonnet", help="Model for workers (default: sonnet)")
    parser.add_argument("--lead-model", default="opus", help="Model for lead agent (default: opus)")
    args = parser.parse_args()

    project_dir = str(Path(args.project_dir).expanduser().resolve())

    asyncio.run(
        run_orchestrator(
            task=args.task,
            project_dir=project_dir,
            num_workers=args.workers,
            model=args.model,
            lead_model=args.lead_model,
        )
    )


if __name__ == "__main__":
    main()
