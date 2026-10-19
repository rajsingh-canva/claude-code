# /// script
# requires-python = ">=3.12"
# ///
"""Compare CLAUDE.md files by running real `claude -p` sessions in throwaway sandboxes.

    uv run evals/claude-md/run.py OLD.md NEW.md [--models ...] [--reps 2] [--jobs 6]

See README.md for what each run gets and what is checked.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from scenarios import SCENARIOS, Run

HERE = os.path.dirname(os.path.abspath(__file__))
VAULT_FOLDERS = ["3 - Tags", "5 - Templates", "7 - Context", "8 - Plans"]
MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
BASH_ALLOW = ["git", "date", "ls", "cat", "tail", "head", "grep", "wc", "diff", "cd", "mkdir",
              "cp", "echo", "gh", "uv", "/opt/homebrew/bin/python3.12"]
ALLOWED = (["Read", "Write", "Edit", "Glob", "Grep", "Agent", "EnterWorktree"]
           + [f"Bash({c}:*)" for c in BASH_ALLOW])
DISALLOWED = ["Bash(obsidian:*)", "Bash(notebooklm:*)", "WebFetch", "WebSearch"]
SANDBOX_NOTE = ("You are running inside an eval sandbox. The Obsidian CLI and NotebookLM are "
                "unavailable, so edit vault files directly. Do not ask questions; act on the request.")
SKILL_V1 = "---\nname: demo-skill\ndescription: Demo skill used by the CLAUDE.md eval.\n---\n\n# Demo skill\n\nSays hello.\n"
PLAN_FILE = """# Migrate homelab DNS from Pi-hole to AdGuard Home

## Context
Pi-hole is due for replacement; AdGuard Home gives DoH/DoT upstreams and per-client rules.

## Steps
1. Deploy an AdGuard Home LXC with Terraform.
2. Port blocklists and local DNS records.
3. Point the router's DHCP DNS option at the new resolver.
4. Decommission Pi-hole after a week.

## Files to create/modify
- terraform/adguard.tf
- ansible/roles/adguard/

## Verification
- dig against the new resolver
- check its query log
"""
SKILL_V2 = SKILL_V1 + "\n## Usage\n\nRun `/demo-skill` and it says hello.\n"


def sh(*cmd, cwd=None, env=None):
    subprocess.run(cmd, cwd=cwd, env=env, check=True, capture_output=True)


def rewrite_paths(text, root):
    """Point every real path CLAUDE.md mentions at the sandbox."""
    home = os.path.expanduser("~")
    for real, fake in [("~/.claude/skills", "dot-claude/skills"), ("~/.claude/plans", "dot-claude/plans"),
                       ("~/TheBible", "vault"),
                       ("~/Work", "work")]:
        text = text.replace(real, f"{root}/{fake}").replace(real.replace("~", home), f"{root}/{fake}")
    return text


def build_sandbox(root, base, claude_md):
    """Fresh vault copy, work dir with CLAUDE.md, git fixture with a bare origin, gh stub."""
    shutil.copytree(base, f"{root}/vault")
    work = f"{root}/work"
    os.makedirs(f"{work}/.claude")
    with open(f"{work}/CLAUDE.md", "w") as f:
        f.write(rewrite_paths(claude_md, root))
    guard = {"hooks": {"PreToolUse": [{"matcher": "Bash|Write|Edit|MultiEdit|NotebookEdit", "hooks": [
        {"type": "command", "command": f"{sys.executable} {HERE}/guard.py {root}"}]}]}}
    with open(f"{work}/.claude/settings.json", "w") as f:
        json.dump(guard, f, indent=2)

    os.makedirs(f"{root}/bin")
    shutil.copy(f"{HERE}/gh-stub", f"{root}/bin/gh")
    os.chmod(f"{root}/bin/gh", 0o755)
    open(f"{root}/gh-calls.jsonl", "w").close()
    with open(f"{root}/gitconfig", "w") as f:
        f.write("[user]\n\tname = Eval User\n\temail = eval@example.com\n[init]\n\tdefaultBranch = main\n")
    env = run_env(root)

    # origin (bare) -> seed clone pushes v1; work/claude-code clones it; then origin
    # moves ahead so a correct run must fetch and branch from origin/main.
    origin, seed, clone = f"{root}/origin.git", f"{root}/seed", f"{work}/claude-code"
    sh("git", "init", "-q", "--bare", "-b", "main", origin, env=env)
    sh("git", "clone", "-q", origin, seed, env=env)
    os.makedirs(f"{seed}/.skills/demo-skill")
    with open(f"{seed}/README.md", "w") as f:
        f.write("# claude-code (eval fixture)\n")
    with open(f"{seed}/.skills/demo-skill/SKILL.md", "w") as f:
        f.write(SKILL_V1)
    sh("git", "add", "-A", cwd=seed, env=env)
    sh("git", "commit", "-qm", "Initial commit", cwd=seed, env=env)
    sh("git", "push", "-q", "origin", "main", cwd=seed, env=env)
    sh("git", "clone", "-q", origin, clone, env=env)
    with open(f"{seed}/README.md", "a") as f:
        f.write("\nUpdated upstream after the local clone was made.\n")
    sh("git", "commit", "-qam", "Update README", cwd=seed, env=env)
    sh("git", "push", "-q", "origin", "main", cwd=seed, env=env)
    shutil.rmtree(seed)
    origin_main = subprocess.run(["git", "-C", origin, "rev-parse", "main"], capture_output=True,
                                 text=True, env=env).stdout.strip()

    os.makedirs(f"{work}/.skills/demo-skill")
    with open(f"{work}/.skills/demo-skill/SKILL.md", "w") as f:
        f.write(SKILL_V2)
    os.makedirs(f"{root}/dot-claude/skills")
    os.symlink(f"{work}/.skills/demo-skill", f"{root}/dot-claude/skills/demo-skill")
    os.makedirs(f"{root}/dot-claude/plans")
    with open(f"{root}/dot-claude/plans/witty-crunching-otter.md", "w") as f:
        f.write(PLAN_FILE)
    return {"origin": origin, "clone": clone, "origin_main": origin_main, "skill_v2": SKILL_V2}


def run_env(root):
    env = {k: v for k, v in os.environ.items() if k not in ("GH_TOKEN", "GITHUB_TOKEN")}
    env.update(PATH=f"{root}/bin:{env['PATH']}", GH_STUB_LOG=f"{root}/gh-calls.jsonl",
               GH_CONFIG_DIR=f"{root}/gh-config", GIT_CONFIG_GLOBAL=f"{root}/gitconfig",
               GIT_CONFIG_NOSYSTEM="1")
    return env


def parse_stream(path):
    tool_uses, result = [], {}
    with open(path) as f:
        for line in f:
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ev.get("type") == "assistant":
                for block in ev.get("message", {}).get("content", []):
                    if block.get("type") == "tool_use":
                        tool_uses.append({"name": block["name"], "input": block.get("input", {}),
                                          "parent": ev.get("parent_tool_use_id")})
            elif ev.get("type") == "result":
                result = ev
    return tool_uses, result


def grade(meta):
    root = meta["root"]
    tool_uses, result = parse_stream(f"{root}/stream.jsonl")
    run = Run(root=root, base=meta["base"], start=datetime.fromisoformat(meta["start"]),
              end=datetime.fromisoformat(meta["end"]), tool_uses=tool_uses, repo=dict(meta["repo"]))
    with open(f"{root}/gh-calls.jsonl") as f:
        run.repo["gh_calls"] = [json.loads(l) for l in f if l.strip()]
    try:
        checks = SCENARIOS[meta["scenario"]][1](run)
    except Exception as e:  # a crash in a check is a failed run, not a harness crash
        checks = {"check_error": False}
        meta["check_error"] = repr(e)
    guard_log = f"{root}/guard.log"
    checks["stayed_in_sandbox"] = not (os.path.exists(guard_log) and os.path.getsize(guard_log))
    meta.update(checks=checks, passed=all(checks.values()),
                cost=result.get("total_cost_usd") or 0.0,
                duration=meta["wall_ms"] / 1000,  # result.duration_ms covers only the last turn
                is_error=bool(result.get("is_error")) or not result,
                denials=len(result.get("permission_denials") or []))
    with open(f"{root}/meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    return meta


def run_one(out, label, model, scenario, rep, timeout):
    root = f"{out}/runs/{label}/{model}/{scenario}/{rep}"
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    with open(f"{out}/variants/{label}.md") as f:
        repo = build_sandbox(root, f"{out}/base", f.read())
    prompt = rewrite_paths(SCENARIOS[scenario][0], root)
    cmd = ["claude", "-p", "--model", model, "--setting-sources", "project",
           "--permission-mode", "acceptEdits", "--add-dir", root,
           "--allowedTools", *ALLOWED, "--disallowedTools", *DISALLOWED,
           "--append-system-prompt", SANDBOX_NOTE,
           "--output-format", "stream-json", "--verbose", "--", prompt]
    start, t0 = datetime.now(), time.monotonic()
    with open(f"{root}/stream.jsonl", "w") as so, open(f"{root}/stderr.txt", "w") as se:
        try:
            subprocess.run(cmd, cwd=f"{root}/work", env=run_env(root), stdin=subprocess.DEVNULL,
                           stdout=so, stderr=se, timeout=timeout)
        except subprocess.TimeoutExpired:
            se.write(f"\nTIMEOUT after {timeout}s\n")
    meta = {"label": label, "model": model, "scenario": scenario, "rep": rep, "root": root,
            "base": f"{out}/base", "start": start.isoformat(), "end": datetime.now().isoformat(),
            "wall_ms": int((time.monotonic() - t0) * 1000), "repo": repo}
    return grade(meta)


def table(metas, labels, models, scenarios):
    by = defaultdict(list)
    for m in metas:
        by[(m["label"], m["model"], m["scenario"])].append(m)
    cols = [(l, m) for m in models for l in labels]
    short = lambda m: m.replace("claude-", "").replace("-5-5", "")
    lines = ["| scenario | " + " | ".join(f"{l} {short(m)}" for l, m in cols) + " |",
             "|---|" + "---|" * len(cols)]
    for s in scenarios:
        cells = []
        for l, m in cols:
            rs = by[(l, m, s)]
            cells.append(f"{sum(r['passed'] for r in rs)}/{len(rs)}")
        lines.append(f"| {s} | " + " | ".join(cells) + " |")

    def agg(fn):
        return [fn([r for s in scenarios for r in by[(l, m, s)]]) for l, m in cols]

    pct = lambda xs, n: f"{100 * xs / n:.0f}%" if n else "-"
    lines.append("| **runs passed** | " + " | ".join(
        agg(lambda rs: pct(sum(r["passed"] for r in rs), len(rs)))) + " |")
    lines.append("| checks passed | " + " | ".join(agg(lambda rs: pct(
        sum(sum(r["checks"].values()) for r in rs), sum(len(r["checks"]) for r in rs)))) + " |")
    lines.append("| avg duration (s) | " + " | ".join(agg(
        lambda rs: f"{sum(r['duration'] for r in rs) / len(rs):.0f}" if rs else "-")) + " |")
    lines.append("| total cost ($) | " + " | ".join(agg(
        lambda rs: f"{sum(r['cost'] for r in rs):.2f}")) + " |")

    fails = defaultdict(int)
    for m in metas:
        for c, ok in m["checks"].items():
            if not ok:
                fails[(m["scenario"], c, m["label"], short(m["model"]))] += 1
    if fails:
        lines += ["", "Failed checks (count across reps):", ""]
        lines += [f"- {s}.{c} — {l} {mo}: {n}" for (s, c, l, mo), n in sorted(fails.items())]
    return "\n".join(lines)


def touched_real_vault(vault, since):
    hits = []
    for folder in VAULT_FOLDERS:
        for d, _, files in os.walk(os.path.join(vault, folder)):
            hits += [os.path.join(d, f) for f in files if os.path.getmtime(os.path.join(d, f)) >= since]
    return hits


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("claude_md", nargs="*", help="CLAUDE.md files to compare")
    ap.add_argument("--labels", nargs="+", help="column labels (default: file names); with --regrade, column order")
    ap.add_argument("--models", nargs="+", default=MODELS)
    ap.add_argument("--scenarios", nargs="+", default=list(SCENARIOS), choices=list(SCENARIOS))
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=900, help="seconds per run")
    ap.add_argument("--vault", default=os.path.expanduser("~/TheBible"))
    ap.add_argument("--out", help="output dir (default: a new temp dir)")
    ap.add_argument("--regrade", metavar="OUT", help="re-run the checks on an existing output dir")
    a = ap.parse_args()

    if a.regrade:
        metas = []
        for d, _, files in os.walk(f"{a.regrade}/runs"):
            if "meta.json" in files:
                with open(f"{d}/meta.json") as f:
                    metas.append(grade(json.load(f)))
        labels = a.labels or sorted({m["label"] for m in metas})
        models = [m for m in MODELS if any(x["model"] == m for x in metas)]
        scenarios = [s for s in SCENARIOS if any(x["scenario"] == s for x in metas)]
        print(table(metas, labels, models, scenarios))
        return
    if not a.claude_md:
        ap.error("pass at least one CLAUDE.md file (or --regrade OUT)")

    labels = a.labels or [os.path.splitext(os.path.basename(p))[0] for p in a.claude_md]
    if len(set(labels)) != len(labels) or len(labels) != len(a.claude_md):
        ap.error("labels must be unique, one per file (use --labels)")
    out = a.out or os.path.join(tempfile.gettempdir(), "claude-md-eval",
                                datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(f"{out}/variants", exist_ok=True)
    for label, path in zip(labels, a.claude_md):
        shutil.copy(path, f"{out}/variants/{label}.md")
    if not os.path.exists(f"{out}/base"):  # snapshot once so every run starts identical
        for folder in VAULT_FOLDERS:
            shutil.copytree(os.path.join(a.vault, folder), f"{out}/base/{folder}")

    jobs = [(l, m, s, r) for r in range(1, a.reps + 1) for m in a.models for l in labels
            for s in a.scenarios]
    print(f"{len(jobs)} runs, {a.jobs} at a time -> {out}", flush=True)
    since, metas = time.time(), []
    with ThreadPoolExecutor(a.jobs) as pool:
        futs = {pool.submit(run_one, out, *j, a.timeout): j for j in jobs}
        for i, fut in enumerate(as_completed(futs), 1):
            l, m, s, r = futs[fut]
            try:
                meta = fut.result()
            except Exception as e:
                print(f"[{i}/{len(jobs)}] {l} {m} {s} #{r}: HARNESS ERROR {e!r}", flush=True)
                continue
            metas.append(meta)
            bad = [c for c, ok in meta["checks"].items() if not ok]
            print(f"[{i}/{len(jobs)}] {l} {m} {s} #{r}: {'PASS' if meta['passed'] else 'FAIL ' + ','.join(bad)}"
                  f" ({meta['duration']:.0f}s, ${meta['cost']:.2f})", flush=True)

    report = table(metas, labels, a.models, a.scenarios)
    with open(f"{out}/results.md", "w") as f:
        f.write(report + "\n")
    print("\n" + report + f"\n\nFull runs and results.md: {out}")
    touched = touched_real_vault(a.vault, since)
    print(f"Real vault files modified during the eval: {len(touched)}"
          + (" (may be other sessions):\n  " + "\n  ".join(touched) if touched else ""))


if __name__ == "__main__":
    main()
