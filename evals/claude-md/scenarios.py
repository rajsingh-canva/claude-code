"""Eval scenarios: a prompt plus scripted checks against what the run wrote.

Each check function gets a Run and returns {check_name: bool}. A run passes a
scenario when every check is True.
"""

import os
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timedelta

CONTEXT = "7 - Context"
PLANS = "8 - Plans"
TAGS = "3 - Tags"
BUILTIN_TAGS = {"Claude Session", "Claude Plan"}


@dataclass
class Run:
    root: str  # sandbox root
    base: str  # pristine vault copy to diff against
    start: datetime
    end: datetime
    tool_uses: list = field(default_factory=list)  # [{name, input, parent}]
    repo: dict = field(default_factory=dict)  # git fixture facts (skill scenario)

    @property
    def vault(self):
        return os.path.join(self.root, "vault")

    def read(self, *parts, base=False):
        with open(os.path.join(self.base if base else self.vault, *parts)) as f:
            return f.read()

    def new_files(self, folder):
        before = set(os.listdir(os.path.join(self.base, folder)))
        return sorted(set(os.listdir(os.path.join(self.vault, folder))) - before)

    def bash_commands(self):
        return [t["input"].get("command", "") for t in self.tool_uses if t["name"] == "Bash"]


# ---------- shared helpers ----------

def _dirs(top):
    return {os.path.relpath(d, top) for d, _, _ in os.walk(top)}


def _git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def _date_ok(run, title):
    days = {run.start.strftime("%Y-%m-%d"), run.end.strftime("%Y-%m-%d")}
    return bool(re.match(r"\d{4}-\d{2}-\d{2} - \S.*", title)) and title[:10] in days


def _date_line_ok(run, text):
    first = text.lstrip("﻿").splitlines()[0] if text.strip() else ""
    m = re.fullmatch(r"Date: (\d{2}-\d{2}-\d{4} \d{2}:\d{2})\s*", first)
    if not m:
        return False
    stamp = datetime.strptime(m.group(1), "%d-%m-%Y %H:%M")
    lo = run.start.replace(second=0, microsecond=0) - timedelta(minutes=1)
    return lo <= stamp <= run.end + timedelta(minutes=1)


def _field(text, name):
    for line in text.splitlines():
        if line.startswith(name + ":"):
            return line[len(name) + 1:].strip()
    return None


def _links(s):
    return re.findall(r"\[\[([^\]|#]+)", s or "")


def _headings_in_order(text, expected):
    heads = [l.strip() for l in text.splitlines() if l.startswith("#")]
    i = 0
    for h in heads:
        if i < len(expected) and h.startswith(expected[i]):
            i += 1
    return i == len(expected)


def _no_placeholders(text):
    return not re.search(r"\{\{|\[\[Tag\d\]\]|Title Here|Plan Note Title|plan-hash-name", text)


def _index_appended(run, index_file, title):
    """Index got exactly one new line `N. [[title]]`, N = last + 1, nothing else changed."""
    old = run.read(TAGS, index_file, base=True).rstrip().splitlines()
    new = run.read(TAGS, index_file).rstrip().splitlines()
    nums = [int(m.group(1)) for l in old if (m := re.match(r"\s*(\d+)\.", l))]
    want = f"{(max(nums) if nums else 0) + 1}. [[{title}]]"
    if [l.rstrip() for l in new[:len(old)]] != [l.rstrip() for l in old]:
        return False
    return [l.rstrip() for l in new[len(old):] if l.strip()] == [want]


def _tag_checks(run, tags_line, required):
    tags = [t.strip() for t in _links(tags_line)]
    topic = [t for t in tags if t not in BUILTIN_TAGS]
    created = [f[:-3] for f in run.new_files(TAGS) if f.endswith(".md")]
    return {
        "tags_builtin": all(t in tags for t in required) and "Session" not in tags and "Plan" not in tags,
        "tags_topic": 1 <= len(topic) <= 3,
        "tag_files_exist": all(os.path.exists(os.path.join(run.vault, TAGS, t + ".md")) for t in topic),
        "new_tag_files_clean": all(run.read(TAGS, t + ".md").strip() == f"# {t}" for t in created),
        "no_new_folders": _dirs(run.vault) == _dirs(run.base),
    }


def _context_note_checks(run):
    notes = [f for f in run.new_files(CONTEXT) if f.endswith(".md")]
    if len(notes) != 1:
        return {"one_context_note": False}, None, None
    title = notes[0][:-3]
    text = run.read(CONTEXT, notes[0])
    res = {
        "one_context_note": True,
        "filename": _date_ok(run, title),
        "date_line": _date_line_ok(run, text),
        "template_headings": _headings_in_order(
            text, ["# Session:", "# What was completed", "# Steps carried out",
                   "# Files created/modified", "## References"]),
        "no_placeholders": _no_placeholders(text),
        "session_index": _index_appended(run, "Claude Session.md", title),
    }
    res.update(_tag_checks(run, _field(text, "Tags"), ["Claude Session"]))
    return res, title, text


# ---------- scenarios ----------

def check_context_note(run):
    res, _, text = _context_note_checks(run)
    if text is not None:
        res["plan_na"] = (_field(text, "Plan") or "").strip("`") == "N/A"
        res["prefers_existing_tag"] = "Ansible" in _links(_field(text, "Tags"))
    return res


def check_new_tag(run):
    res, _, text = _context_note_checks(run)
    if text is not None:
        res["new_tag_created"] = "Zigbee2MQTT.md" in run.new_files(TAGS)
        res["new_tag_used"] = "Zigbee2MQTT" in _links(_field(text, "Tags"))
    return res


def check_plan_note(run):
    notes = [f for f in run.new_files(PLANS) if f.endswith(".md")]
    if len(notes) != 1:
        return {"one_plan_note": False}
    title = notes[0][:-3]
    text = run.read(PLANS, notes[0])
    res = {
        "one_plan_note": True,
        "filename": _date_ok(run, title),
        "date_line": _date_line_ok(run, text),
        "status_approved": (_field(text, "Status") or "") == "Approved",
        "plan_id": "witty-crunching-otter" in (_field(text, "Plan ID") or ""),
        "template_headings": _headings_in_order(
            text, ["# Plan:", "## Context", "## Steps", "## Files to create/modify",
                   "## Verification", "## References"]),
        "no_placeholders": _no_placeholders(text),
        "plan_index": _index_appended(run, "Claude Plan.md", title),
    }
    res.update(_tag_checks(run, _field(text, "Tags"), ["Claude Plan", "Claude Session"]))
    ctx, _, ctx_text = _context_note_checks(run)
    res["context_links_plan"] = ctx_text is not None and title in _links(_field(ctx_text, "Plan"))
    return res


def check_skill_ship(run):
    r = run.repo
    origin, clone = r["origin"], r["clone"]
    heads = (_git(origin, "for-each-ref", "--format=%(refname:short)", "refs/heads") or "").split()
    branches = [b for b in heads if b != "main"]
    res = {
        "main_not_pushed": _git(origin, "rev-parse", "main") == r["origin_main"],
        "branch_pushed": len(branches) == 1,
    }
    if len(branches) == 1:
        b = branches[0]
        res["cut_from_origin_main"] = _git(origin, "merge-base", b, "main") == r["origin_main"]
        res["one_commit"] = _git(origin, "rev-list", "--count", f"main..{b}") == "1"
        res["skill_copied"] = _git(origin, "show", f"{b}:.skills/demo-skill/SKILL.md") == r["skill_v2"].strip()
        msg = _git(origin, "log", "--format=%B", f"main..{b}") or ""
        res["no_coauthor"] = "co-authored-by" not in msg.lower()
    worktrees = (_git(clone, "worktree", "list", "--porcelain") or "").count("worktree ")
    res["worktree_used"] = worktrees >= 2
    res["main_checkout_on_main"] = _git(clone, "branch", "--show-current") == "main"
    calls = r["gh_calls"]
    creates = [c for c in calls if c["args"][:2] == ["pr", "create"]]
    res["pr_created"] = len(creates) >= 1
    res["pr_no_footer"] = bool(creates) and all(
        "generated with claude code" not in (c["body"] or "").lower()
        and "co-authored-by" not in (c["body"] or "").lower() for c in creates)
    res["no_merge"] = not any(c["args"][:2] == ["pr", "merge"] for c in calls) and not any(
        _is_git_merge(seg) for c in run.bash_commands() for seg in re.split(r"[;\n]|&&|\|\|", c))
    return res


def _is_git_merge(segment):
    toks = segment.split()
    if not toks or toks[0] != "git":
        return False
    toks = toks[1:]
    while toks[:1] == ["-C"]:
        toks = toks[2:]
    return toks[:1] == ["merge"]


def check_trivial_qa(run):
    changed = [t for t in run.tool_uses if t["name"] in ("Write", "Edit", "MultiEdit", "NotebookEdit")]
    return {
        "no_subagent": not any(t["name"] in ("Agent", "Task") for t in run.tool_uses),
        "no_writes": not changed,
        "vault_untouched": not run.new_files(CONTEXT) and not run.new_files(TAGS)
        and run.read(TAGS, "Claude Session.md") == run.read(TAGS, "Claude Session.md", base=True),
    }


PY = re.compile(r"(?<![\w.-])((?:[\w./-]*/)?python(?:3(?:\.\d+)?)?)(?=[\s;|&)]|$)")


def check_python(run):
    cmds = run.bash_commands()
    calls = [c for c in cmds if PY.search(c) or re.search(r"\buv\s+run\b", c)]
    bad = [c for c in calls if not re.search(r"\buv\s+run\b", c)
           and any(m != "/opt/homebrew/bin/python3.12" for m in PY.findall(c))]
    return {"ran_python": bool(calls), "uv_or_brew_python": bool(calls) and not bad}


SCENARIOS = {
    "context_note": (
        "We just finished fixing a broken Ansible playbook in ~/Work/homelab-infra/site.yml "
        "(no plan used). Write this session's context note now.",
        check_context_note,
    ),
    "plan_note": (
        "I just approved the plan in ~/.claude/plans/witty-crunching-otter.md (migrate homelab DNS "
        "from Pi-hole to AdGuard Home). Don't start implementing yet - just do the bookkeeping "
        "for the approved plan.",
        check_plan_note,
    ),
    "skill_ship": (
        "I updated the demo-skill skill in ~/Work/.skills/demo-skill/ (added a Usage section). "
        "Ship it.",
        check_skill_ship,
    ),
    "new_tag": (
        "We just finished pairing six Aqara door sensors with Zigbee2MQTT on the homelab and "
        "exposing them to Home Assistant over MQTT (no plan used). Write this session's "
        "context note now, and tag it Zigbee2MQTT too.",
        check_new_tag,
    ),
    "trivial_qa": (
        "Quick question: what's the difference between git merge and git rebase? One short paragraph.",
        check_trivial_qa,
    ),
    "python": (
        "Run a quick Python one-liner that prints the sum of the squares of 1..100 and tell me the result.",
        check_python,
    ),
}
