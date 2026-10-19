#!/usr/bin/env python3
"""Check Mermaid diagrams in Obsidian notes against the engine Obsidian is actually running.

Two layers:
  * Live check (exact): each block is parsed and rendered off-screen inside the running
    Obsidian app via `obsidian eval`, so the verdict comes from the same engine that draws
    the note (mermaid.js today, Pele once Obsidian ships it).
  * Portability rules (static): things that parse today but will be ignored, dropped or
    rejected by Pele, plus Obsidian-specific gotchas.

Usage:
  check_diagrams.py NOTE.md [NOTE.md ...]   notes as absolute or vault-relative paths
  check_diagrams.py --vault                  every note in the vault
  check_diagrams.py --source FILE.mmd        a standalone diagram (check before writing it)
  check_diagrams.py --engine                 Obsidian version, engine and vault trust state only

Options:
  --json             machine-readable output
  --static-only      skip Obsidian, run the portability rules only
  --screenshot       also open each note in reading view and save a PNG (absolute path reported)
  --export DIR       save each diagram that renders as DIR/<note>-diagramN.svg, -light.png and -dark.png.
                     Rendered by Obsidian's own engine; -dark emulates Obsidian's dark-mode invert filter.
                     Works even while the vault trust banner hides diagrams in notes — use it to look.
  --vault-path PATH  vault root (default: ask Obsidian, else $OBSIDIAN_VAULT, else ~/TheBible)

Exit codes: 0 = no blocking problems, 1 = at least one block fails on the live engine,
            2 = Obsidian unreachable and live check was required.
Python 3.12+, stdlib only. Read-only: never edits notes or Obsidian settings.
"""
from __future__ import annotations

import argparse
import base64
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

OBSIDIAN = shutil.which("obsidian") or "/opt/homebrew/bin/obsidian"
LOCK_PATH = Path(tempfile.gettempdir()) / "obsidian-cli.lock"
SHOT_DIR = Path(tempfile.gettempdir()) / "obsidian-diagrams"
CHUNK_BYTES = 150_000  # keep each eval argument well under ARG_MAX

# keyword -> (family, first Mermaid version that has it; "old" = long before 11.13)
TYPES: dict[str, tuple[str, str]] = {
    "flowchart": ("flowchart", "old"), "graph": ("flowchart", "old"),
    "sequenceDiagram": ("sequence", "old"), "classDiagram": ("class", "old"),
    "classDiagram-v2": ("class", "old"), "stateDiagram": ("state", "old"),
    "stateDiagram-v2": ("state", "old"), "erDiagram": ("er", "old"), "gantt": ("gantt", "old"),
    "gitGraph": ("gitGraph", "old"), "pie": ("pie", "old"), "mindmap": ("mindmap", "old"),
    "timeline": ("timeline", "old"), "journey": ("journey", "old"),
    "quadrantChart": ("quadrant", "old"), "requirementDiagram": ("requirement", "old"),
    "C4Context": ("c4", "old"), "C4Container": ("c4", "old"), "C4Component": ("c4", "old"),
    "C4Dynamic": ("c4", "old"), "C4Deployment": ("c4", "old"), "info": ("info", "old"),
    "xychart": ("xychart", "old"), "xychart-beta": ("xychart", "old"),
    "sankey": ("sankey", "old"), "sankey-beta": ("sankey", "old"),
    "block": ("block", "old"), "block-beta": ("block", "old"),
    "packet": ("packet", "old"), "packet-beta": ("packet", "old"),
    "kanban": ("kanban", "old"), "architecture-beta": ("architecture", "old"),
    "radar-beta": ("radar", "old"), "treemap": ("treemap", "old"),
    "treemap-beta": ("treemap", "old"), "venn-beta": ("venn", "11.13"),
    "ishikawa": ("ishikawa", "11.13"), "ishikawa-beta": ("ishikawa", "11.13"),
    # Not in mermaid 11.13 -> Pele (or a newer Obsidian) only
    "wardley-beta": ("wardley", "11.14"), "treeView-beta": ("treeView", "11.14"),
    "eventmodeling": ("eventmodeling", "11.15"), "cynefin-beta": ("cynefin", "11.16"),
    "railroad-beta": ("railroad", "11.16"), "railroad-ebnf-beta": ("railroad", "11.16"),
    "railroad-abnf-beta": ("railroad", "11.16"), "railroad-peg-beta": ("railroad", "11.16"),
    "swimlane-beta": ("swimlane", "11.16"), "usecase-beta": ("usecase", "12.0"),
    "agentflow-beta": ("agentflow", "12.0"),
}
OBSIDIAN_MERMAID = (11, 13)  # what Obsidian 1.14.x bundles; refreshed live when Obsidian answers

PELE_STYLE_ALLOW = {
    "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset",
    "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "rx", "ry", "color",
    "font-size", "font-family", "font-weight", "font-style", "text-decoration",
    "letter-spacing", "word-spacing",
}
PELE_IGNORED_CONFIG = {"theme", "themeVariables", "themeCSS", "look", "layout", "htmlLabels",
                       "fontFamily", "fontSize", "securityLevel", "darkMode"}
LABEL_TAGS_OK = {"br", "b", "strong", "i", "em"}
LINKABLE_FAMILIES = {"flowchart", "swimlane", "agentflow", "er"}
NO_INLINE_STYLE = {"pie", "xychart", "radar", "sankey", "packet", "gitGraph", "timeline",
                   "journey", "ishikawa", "cynefin", "wardley", "eventmodeling", "railroad"}
# syntax added to existing types after mermaid 11.13 (static fallback when live check is off)
NEWER_SYNTAX = [  # (family, pattern, severity, message) — "error" = parse fails on 11.13
    ("flowchart", re.compile(r"@\{[^}]*shape:\s*['\"]?(datastore|folder|bucket|console|browser|person)\b"),
     "error", "flowchart shape '{0}' needs Mermaid 11.15+/11.17+"),
    ("flowchart", re.compile(r"@\{[^}]*view:\s*['\"]?collapsed"), "error", "collapsed subgraphs need Mermaid 11.17+"),
    ("architecture", re.compile(r"^\s*align\s+(row|column)\b", re.M), "error", "architecture 'align' needs Mermaid 11.16+"),
    ("class", re.compile(r"^\s*namespace\s+[\w-]+\.[\w.-]+", re.M), "error", "dotted/nested namespaces need Mermaid 11.15+"),
    ("er", re.compile(r"^\s+\w+\?\s+\w+", re.M), "error", "optional attribute types (string?) need Mermaid 11.16+"),
    ("sequence", re.compile(r"^\s*autonumber\s+\d+\.\d+", re.M), "error", "decimal autonumber needs Mermaid 11.15+"),
    ("pie", re.compile(r"\b(donutHole|legendPosition|highlightSlice)\s*:"), "warn", "pie '{0}' is ignored before Mermaid 11.16"),
    ("timeline", re.compile(r"^\s*timeline\s+(LR|RL|TB|TD|BT)\b", re.M), "warn", "timeline direction is ignored before Mermaid 11.14"),
]

FENCE_OPEN = re.compile(r"^(?P<quote>(?:[ \t]*>[ \t]?)*)[ \t]*(?P<fence>`{3,}|~{3,})[ \t]*mermaid[ \t]*$")


@dataclass
class Finding:
    severity: str  # error (fails now) | warn (renders, not as written) | layout | pele-break | pele-change | note
    message: str


@dataclass
class Block:
    note: str
    index: int
    start_line: int  # 1-based line in the note of the first diagram line
    source: str
    keyword: str | None = None
    family: str | None = None
    live: dict | None = None
    findings: list[Finding] = field(default_factory=list)


# --------------------------------------------------------------------------- extraction
def extract_blocks(text: str, note: str) -> list[Block]:
    lines = text.splitlines()
    blocks: list[Block] = []
    i = 0
    while i < len(lines):
        m = FENCE_OPEN.match(lines[i])
        if not m:
            i += 1
            continue
        depth = m.group("quote").count(">")
        fence = m.group("fence")
        strip = re.compile(r"^[ \t]*" + r"(?:>[ \t]?)" * depth) if depth else None
        body, j = [], i + 1
        while j < len(lines):
            line = strip.sub("", lines[j], count=1) if strip else lines[j]
            if line.strip().startswith(fence[0] * len(fence)) and set(line.strip()) == {fence[0]}:
                break
            body.append(line)
            j += 1
        blocks.append(Block(note=note, index=len(blocks) + 1, start_line=i + 2, source="\n".join(body)))
        i = j + 1
    return blocks


def frontmatter(src: str) -> tuple[str, int]:
    lines = src.splitlines()
    if lines and lines[0].strip() == "---":
        for j in range(1, len(lines)):
            if lines[j].strip() == "---":
                return "\n".join(lines[1:j]), j + 1
    return "", 0


def detect_keyword(src: str) -> str | None:
    _, skip = frontmatter(src)
    for line in src.splitlines()[skip:]:
        s = line.strip()
        if not s or s.startswith("%%"):
            continue
        return s.split()[0].rstrip(";:")
    return None


# --------------------------------------------------------------------------- static rules
def config_keys(src: str) -> set[str]:
    keys: set[str] = set()
    fm, _ = frontmatter(src)
    lines = fm.splitlines()
    for n, line in enumerate(lines):
        if re.match(r"^config:\s*$", line):
            child_indent = None
            for sub in lines[n + 1:]:
                if not sub.strip():
                    continue
                indent = len(sub) - len(sub.lstrip())
                if indent == 0:
                    break
                child_indent = child_indent or indent
                if indent == child_indent and ":" in sub:
                    keys.add(sub.strip().split(":", 1)[0].strip("'\""))
    for d in re.findall(r"%%\{\s*init(?:ialize)?\s*:\s*(\{.*?\})\s*\}%%", src, re.S):
        try:
            keys.update(json.loads(d.replace("'", '"')).keys())
        except json.JSONDecodeError:
            keys.update(re.findall(r"['\"]?(\w+)['\"]?\s*:", d)[:1])
    return keys


def static_rules(b: Block, live_available: bool) -> None:
    src, fam, add = b.source, b.family, b.findings.append
    if b.keyword is None:
        add(Finding("error", "empty block or no diagram keyword"))
        return
    if fam is None:
        add(Finding("pele-break", f"'{b.keyword}' is not a diagram type Mermaid 12.1/Pele knows "
                                  "(ZenUML and plugin types are unsupported)"))
        return
    first = TYPES[b.keyword][1]
    if not live_available and first not in ("old", "11.13"):
        add(Finding("error", f"'{b.keyword}' needs Mermaid {first}+; Obsidian's bundled 11.13 shows an error "
                             "(renders once Obsidian switches to Pele)"))
    for family, rx, sev, msg in NEWER_SYNTAX:
        if fam == family and (m := rx.search(src)) and (sev != "error" or not live_available):
            add(Finding(sev, msg.format(m.group(1) if m.groups() else "")))

    ignored = sorted(config_keys(src) & PELE_IGNORED_CONFIG)
    if ignored:
        add(Finding("pele-change", f"config {', '.join(ignored)} applies on mermaid.js only; Pele ignores it silently"))

    fixed_colour = False
    for m in re.finditer(r"^\s*(style|classDef|linkStyle)\s+(\S+)\s+(.+)$", src, re.M):
        kind, name, body = m.group(1), m.group(2), m.group(3)
        props = [p.split(":", 1)[0].split()[-1].lower() for p in body.split(",") if ":" in p and p.split(":", 1)[0].split()]
        dropped = sorted({p for p in props if p not in PELE_STYLE_ALLOW})
        if dropped:
            add(Finding("pele-change", f"{kind} {name}: {', '.join(dropped)} is dropped by Pele"))
        if "!important" in body:
            add(Finding("pele-change", "!important is stripped by Pele"))
        if re.search(r"(fill|color|stroke)\s*:\s*(#|rgb|hsl|[a-z]+\b)", body):
            fixed_colour = True
        if kind == "classDef" and "fill" in props and "color" not in props:
            add(Finding("note", f"classDef {name} sets fill without color: — text colour then comes from the "
                                "theme and can clash; pair them"))
    if fixed_colour:
        add(Finding("note", "fixed colours: Obsidian's dark mode inverts them today (invert + hue-rotate); "
                            "under Pele they stay exactly as written. Light fills + dark color: read well in all three"))
    if fam in NO_INLINE_STYLE and re.search(r"^\s*(style|classDef)\b", src, re.M):
        add(Finding("pele-change", f"{fam} has no inline styling in Pele; colours come from --pele-series-1..8"))
    for m in re.finditer(r"^\s*(box|rect)\s+(rgb\([^)]*\)|hsl\([^)]*\)|rgba\([^)]*,\s*(0?\.[5-9]\d*|1(\.0*)?)\s*\)|(?!rgba|hsla|transparent\b)[A-Za-z]+\b)", src if fam == "sequence" else "", re.M):
        add(Finding("pele-change", f"sequence {m.group(1)} '{m.group(2)}' is an opaque tint: message text can't be coloured "
                                   "and follows the theme, so under Pele dark mode it becomes light-on-light. "
                                   "Use a translucent rgba(r,g,b,0.15-0.3)"))
    if fam == "sequence" and re.search(r"^\s*(box|rect)\s+#[0-9a-fA-F]{3,8}\b", src, re.M):
        add(Finding("warn", "sequence box/rect with a hex colour parses but the colour is silently dropped "
                            "(and box loses its title); use a CSS name or rgb()/rgba()/hsl()"))

    tags = {t.lower() for t in re.findall(r"(?<!<)<\s*/?\s*([a-zA-Z][a-zA-Z0-9]*)[^<>]*>(?!>)", src)}
    stripped = sorted(tags - LABEL_TAGS_OK)
    if stripped and fam not in ("class",):
        add(Finding("pele-change", f"HTML tag(s) {', '.join('<'+t+'>' for t in stripped)} are stripped by Pele "
                                   "(only <br>, <b>/<strong>, <i>/<em> survive)"))
    for m in re.finditer(r"^\s*click\s+\S+\s+(?!href\b)(?![\"'])(\S+)", src, re.M):
        add(Finding("pele-change", f"click callback '{m.group(1)}' never runs (Obsidian's strict mode and Pele "
                                   "ignore JS); use click X href \"https://…\" or internal-link"))
    if "internal-link" in src and fam not in LINKABLE_FAMILIES:
        add(Finding("note", f"internal-link only turns nodes into note links in flowcharts (and ER/swimlane/"
                            f"agentflow under Pele), not in {fam}"))
    if re.search(r"\[\[[^\]]*(\||\.md|#)[^\]]*\]\]", src):
        add(Finding("note", "[[…]] inside a diagram draws a shape, it is not a wikilink; "
                            "link notes with class X internal-link"))
    if re.search(r"::icon\(|\bfa:fa-", src):
        add(Finding("note", "icons need an icon font/resolver; Obsidian loads none today, so they won't show"))
    if len(src) > 50_000:
        add(Finding("pele-break", f"{len(src):,} characters: Pele rejects sources over 50,000"))
    edges = len(re.findall(r"(-->|---|-\.->|==>|--[ox]|~~~)", src))
    if edges > 5_000:
        add(Finding("pele-break", f"~{edges:,} edges: Pele rejects flowcharts over 5,000"))


def layout_findings(b: Block) -> None:
    """House style: no crossing or overlapping lines, no lines through boxes, no text on lines."""
    L = (b.live or {}).get("layout")
    if not L:
        return
    add = b.findings.append
    ex = lambda k: "; ".join(L.get(k) or [])
    if L.get("crossings"):
        add(Finding("layout", f"{L['crossings']} line crossing(s): {ex('crossing_examples')}. Reorder node "
                              "declarations, change direction, or split the diagram"))
    if L.get("overlaps"):
        add(Finding("layout", f"{L['overlaps']} pair(s) of lines run on top of each other: {ex('overlap_examples')}"))
    if L.get("through"):
        add(Finding("layout", f"{L['through']} line(s) pass through a box: {ex('through_examples')}"))
    if L.get("labels"):
        add(Finding("layout", f"{L['labels']} label(s) on lines ({ex('label_texts')}). House style is no text on "
                              "lines: move the words into the boxes (see SKILL.md, House style)"))
    if L.get("label_hits"):
        add(Finding("layout", f"label text collides: {ex('label_hit_examples')}"))


def explain_live_error(b: Block) -> None:
    """Turn the engine's raw errors into something actionable."""
    err = (b.live or {}).get("error") or ""
    if not err:
        return
    if err.startswith("No diagram type detected"):
        b.live["error"] = "No diagram type detected (this engine doesn't know the keyword)"
        first = TYPES.get(b.keyword or "", (None, None))[1]
        if first and first not in ("old", "11.13"):
            b.findings.append(Finding("error", f"'{b.keyword}' needs Mermaid {first}+ — it renders only after "
                                               "Obsidian switches to Pele. Use a fallback type that renders today, "
                                               "or keep it and tell the user it shows as an error until then"))
    elif "Lexical error" in err or "Parse error" in err:
        if re.search(r"got 'PS'|got 'PE'|got 'SQS'|got 'SQE'", err):
            b.findings.append(Finding("note", "brackets/parentheses inside a label: wrap the label in double "
                                              "quotes, e.g. A[\"Start (draft)\"]"))
        if re.search(r"\bend\b", b.source) and re.search(r"got 'end'|'end'", err, re.I):
            b.findings.append(Finding("note", "'end' is reserved: capitalise it (End) or quote it as a label"))
        if m := re.search(r"got '(STYLE|CLASSDEF|CLASS|LINKSTYLE|CLICK|SUBGRAPH|DIR|INTERPOLATE)'", err):
            word = m.group(1).lower().replace("classdef", "classDef").replace("linkstyle", "linkStyle")
            b.findings.append(Finding("note", f"'{word}' is a reserved word: it can't be a node id or class "
                                              f"name (e.g. classDef {word} … / :::{word}). Rename it to a word that doesn't start with a keyword, "
                                              "e.g. guide"))


# --------------------------------------------------------------------------- Obsidian bridge
class ObsidianUnavailable(RuntimeError):
    pass


def cli(args: list[str], timeout: float = 30) -> str:
    """Run the Obsidian CLI. It sometimes keeps running after printing, so kill on timeout."""
    try:
        p = subprocess.Popen([OBSIDIAN, *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except FileNotFoundError as e:
        raise ObsidianUnavailable(f"Obsidian CLI not found at {OBSIDIAN}") from e
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        p.kill()
        out, _ = p.communicate()
    return out or ""


def ev(js: str, timeout: float = 60) -> dict:
    out = cli(["eval", f"code={js}"], timeout=timeout)
    for line in out.splitlines():
        if line.startswith("=> "):
            try:
                return json.loads(line[3:])
            except json.JSONDecodeError:
                break
    raise ObsidianUnavailable("no result from obsidian eval (is the Obsidian app running?) "
                              + out.strip()[-300:])


class Lock:
    def __enter__(self):
        self.f = open(LOCK_PATH, "w")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def b64(obj) -> str:
    return base64.b64encode(json.dumps(obj).encode()).decode()


DECODE = "JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('{payload}'),c=>c.charCodeAt(0))))"

ENGINE_JS = """(async()=>{const B=%DECODE%;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const res={vault_path:app.vault.adapter.basePath,trusted:app.loadLocalStorage('mermaid-vault-trust')===true,engine:null,engine_version:null,bootstrapped:false};
if(window.pele&&typeof window.pele.parse==='function'){res.engine='pele';res.engine_version=window.pele.version||null}
if(!res.engine&&!window.mermaid&&B.bootstrap){const f=app.vault.getAbstractFileByPath(B.bootstrap);
 if(f){const prev=app.workspace.activeLeaf;const leaf=app.workspace.getLeaf('tab');
  try{await leaf.openFile(f,{active:false,state:{mode:'preview'}});for(let k=0;k<40&&!window.mermaid&&!document.querySelector('svg.pele');k++)await sleep(100)}
  finally{leaf.detach();if(prev)app.workspace.setActiveLeaf(prev,{focus:false})}res.bootstrapped=true}}
if(!res.engine&&document.querySelector('svg.pele'))res.engine='pele';
if(!res.engine&&window.mermaid){res.engine='mermaid';try{const t=await (await fetch('lib/mermaid.min.js')).text();const m=t.match(/version:"([0-9.]+)"/);res.engine_version=m?m[1]:null}catch(e){}}
return JSON.stringify(res)})()"""

CHECK_JS = """(async()=>{const B=%DECODE%;const out=[];
if(window.pele&&typeof window.pele.parse==='function'){for(const src of B.blocks){const r={ok:false};try{window.pele.parse(src);r.ok=true}catch(e){r.error=String(e&&e.message||e).slice(0,600);r.line=e&&e.line||null;r.column=e&&e.column||null}out.push(r)}return JSON.stringify({engine:'pele',blocks:out})}
const m=window.mermaid;if(!m)return JSON.stringify({engine:null,blocks:[]});let n=0;
const FONT=getComputedStyle(document.body).getPropertyValue('--font-mermaid').trim()||'sans-serif';
async function png(svg,dark){const vb=(svg.match(/viewBox="([^"]+)"/)||[])[1];let w=800,h=600;if(vb){const q=vb.split(/[ ,]+/).map(Number);w=Math.ceil(q[2]);h=Math.ceil(q[3])}
 const el=new DOMParser().parseFromString(svg,'text/html').querySelector('svg');const xml=el?new XMLSerializer().serializeToString(el):svg;
 const s=xml.split('var(--font-mermaid)').join(FONT).replace(/<svg[^>]*>/,t=>t.replace(/ (width|height)="[^"]*"/g,'').replace(/ style="[^"]*"/,'').replace('<svg','<svg width="'+w+'" height="'+h+'"'));
 const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('svg image failed to load'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s)});
 const sc=2,pad=16,c=document.createElement('canvas');c.width=(w+2*pad)*sc;c.height=(h+2*pad)*sc;const x=c.getContext('2d');x.scale(sc,sc);
 x.fillStyle=dark?'#1e1e1e':'#ffffff';x.fillRect(0,0,w+2*pad,h+2*pad);if(dark)x.filter='invert(100%) hue-rotate(180deg) saturate(1.25)';x.drawImage(img,pad,pad,w,h);
 return {svg:s,png:c.toDataURL('image/png').split(',')[1]}}
function layoutCheck(svg){const pe=[...svg.querySelectorAll('path[data-edge="true"]')].filter(p=>p.getTotalLength()>1);if(!pe.length)return null;
 const bx=e=>{const b=e.getBoundingClientRect();return {x1:b.left,y1:b.top,x2:b.right,y2:b.bottom}};
 const nodes=[...svg.querySelectorAll('g.node')].map(n=>({id:(n.id.match(/^[a-zA-Z]+-(.+)-[0-9]+$/)||[])[1]||n.id,b:bx(n)})).filter(n=>n.b.x2>n.b.x1);
 const ids=new Set(nodes.map(n=>n.id));
 const ends=did=>{const parts=(did||'').replace(/^L_/,'').replace(/_[0-9]+$/,'').split('_');for(let i=1;i<parts.length;i++){const a=parts.slice(0,i).join('_'),b=parts.slice(i).join('_');if(ids.has(a)&&ids.has(b))return [a,b]}return [null,null]};
 const E=pe.map(p=>{const L=p.getTotalLength(),k=Math.max(10,Math.min(120,Math.ceil(L/6))),M=p.getScreenCTM(),pts=[];for(let i=0;i<=k;i++){const q=p.getPointAtLength(L*i/k);const t=new DOMPoint(q.x,q.y).matrixTransform(M);pts.push([t.x,t.y])}const [s,t]=ends(p.getAttribute('data-id'));return {pts,s,t,name:(s&&t)?s+' -> '+t:(p.getAttribute('data-id')||'edge')}});
 const near=(a,b,d)=>Math.abs(a[0]-b[0])<d&&Math.abs(a[1]-b[1])<d;
 const inB=(q,b,pad)=>q[0]>b.x1+pad&&q[0]<b.x2-pad&&q[1]>b.y1+pad&&q[1]<b.y2-pad;
 const nodeOf=id=>nodes.find(n=>n.id===id);
 const segX=(p1,p2,p3,p4)=>{const d=(p2[0]-p1[0])*(p4[1]-p3[1])-(p2[1]-p1[1])*(p4[0]-p3[0]);if(Math.abs(d)<1e-9)return null;const u=((p3[0]-p1[0])*(p4[1]-p3[1])-(p3[1]-p1[1])*(p4[0]-p3[0]))/d,v=((p3[0]-p1[0])*(p2[1]-p1[1])-(p3[1]-p1[1])*(p2[0]-p1[0]))/d;return (u>0&&u<1&&v>0&&v<1)?[p1[0]+u*(p2[0]-p1[0]),p1[1]+u*(p2[1]-p1[1])]:null};
 const dSeg=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/l:0;t=Math.max(0,Math.min(1,t));const x=a[0]+t*dx-q[0],y=a[1]+t*dy-q[1];return Math.sqrt(x*x+y*y)};
 const dPoly=(q,P)=>{let m=1e9;for(let i=0;i<P.length-1;i++)m=Math.min(m,dSeg(q,P[i],P[i+1]));return m};
 const crossings=[],overlaps=[],through=[];
 for(let i=0;i<E.length;i++)for(let j=i+1;j<E.length;j++){const A=E[i],B=E[j];const tips=[A.pts[0],A.pts[A.pts.length-1],B.pts[0],B.pts[B.pts.length-1]];
  const shared=[A.s,A.t].filter(x=>x&&(x===B.s||x===B.t)).map(nodeOf).filter(Boolean);
  let hit=null;for(let a=0;a<A.pts.length-1&&!hit;a++)for(let b=0;b<B.pts.length-1&&!hit;b++){const x=segX(A.pts[a],A.pts[a+1],B.pts[b],B.pts[b+1]);if(x&&!tips.some(e=>near(e,x,8))&&!shared.some(n=>inB(x,n.b,-6)))hit=x}
  if(hit)crossings.push(A.name+' x '+B.name);
  const inner=A.pts.filter(q=>!tips.some(e=>near(e,q,14))&&!shared.some(n=>inB(q,n.b,-6)));let run=0,best=0;for(const q of inner){run=dPoly(q,B.pts)<1.5?run+1:0;best=Math.max(best,run)}if(best>=3)overlaps.push(A.name+' / '+B.name)}
 for(const e of E){const tips=[e.pts[0],e.pts[e.pts.length-1]];for(const n of nodes){if(n.id===e.s||n.id===e.t)continue;if(!e.s&&!e.t&&tips.some(t=>inB(t,n.b,-6)))continue;if(e.pts.some(q=>!tips.some(t=>near(t,q,6))&&inB(q,n.b,2))){through.push(e.name+' through '+n.id)}}}
 const seen=new Set(),labels=[],labelHits=[];for(const l of svg.querySelectorAll('.edgeLabel')){const t=(l.textContent||'').trim();const b=bx(l);if(!t||b.x2-b.x1<1)continue;const key=t+'|'+Math.round(b.x1)+'|'+Math.round(b.y1);if(seen.has(key))continue;seen.add(key);labels.push(t);
  const c=[(b.x1+b.x2)/2,(b.y1+b.y2)/2];let own=null,md=1e9;for(const e of E){const d=dPoly(c,e.pts);if(d<md){md=d;own=e}}
  for(const e of E){if(e===own)continue;if(e.pts.some(q=>inB(q,b,-1))){labelHits.push("'"+t+"' on line "+e.name)}}
  for(const n of nodes){if(b.x1<n.b.x2&&b.x2>n.b.x1&&b.y1<n.b.y2&&b.y2>n.b.y1){labelHits.push("'"+t+"' over node "+n.id)}}}
 for(const cl of svg.querySelectorAll('g.cluster')){const lb=cl.querySelector('.cluster-label');const t=lb?(lb.textContent||'').trim():'';if(!t)continue;const b=bx(lb);for(const n of nodes){if(b.x1<n.b.x2-1&&b.x2>n.b.x1+1&&b.y1<n.b.y2-1&&b.y2>n.b.y1+1){labelHits.push("subgraph title '"+t+"' over node "+n.id)}}}
 const cap=a=>a.slice(0,6);return {edges:E.length,crossings:crossings.length,crossing_examples:cap(crossings),overlaps:overlaps.length,overlap_examples:cap(overlaps),through:through.length,through_examples:cap(through),labels:labels.length,label_texts:cap(labels),label_hits:labelHits.length,label_hit_examples:cap(labelHits)}}
for(const src of B.blocks){n++;const id='odchk'+Date.now()+'x'+n;const r={ok:false};
 try{const p=await m.parse(src);r.type=p&&p.diagramType||null;const host=document.createElement('div');host.style.cssText='position:fixed;left:-99999px;top:0;width:900px;visibility:hidden';document.body.appendChild(host);
  try{const out=await m.render(id,src,host);r.ok=true;
   if(B.layout){try{host.innerHTML=out.svg;const sv=host.querySelector('svg');const L=sv?layoutCheck(sv):null;if(L)r.layout=L}catch(e){r.layout_error=String(e&&e.message||e)}}
   if(B.export){try{const L=await png(out.svg,false);const D=await png(out.svg,true);r.svg=L.svg;r.png_light=L.png;r.png_dark=D.png}catch(e){r.export_error=String(e&&e.message||e)}}}
  finally{host.remove()}}
 catch(e){r.error=String(e&&e.message||e).slice(0,600);const h=e&&e.hash;if(h&&h.loc)r.line=h.loc.first_line}
 for(const x of [id,'d'+id,'i'+id]){const el=document.getElementById(x);if(el)el.remove()}out.push(r)}
return JSON.stringify({engine:'mermaid',blocks:out})})()"""

SHOT_OPEN_JS = """(async()=>{const B=%DECODE%;const f=app.vault.getAbstractFileByPath(B.path);if(!f)return JSON.stringify({error:'not found'});
window.__odPrevLeaf=app.workspace.activeLeaf;const leaf=app.workspace.getLeaf('tab');window.__odLeaf=leaf;
await leaf.openFile(f,{active:true,state:{mode:'preview'}});const c=leaf.view.containerEl;const want=B.n;
for(let k=0;k<60;k++){const done=c.querySelectorAll('.mermaid > svg, svg.pele, .mermaid-wrapper.is-guarded').length;if(done>=want)break;await new Promise(r=>setTimeout(r,100))}
return JSON.stringify({rendered:c.querySelectorAll('.mermaid > svg, svg.pele').length,guarded:c.querySelectorAll('.mermaid-wrapper.is-guarded').length})})()"""

SHOT_CLOSE_JS = """(()=>{try{if(window.__odLeaf)window.__odLeaf.detach();if(window.__odPrevLeaf)app.workspace.setActiveLeaf(window.__odPrevLeaf,{focus:false})}finally{delete window.__odLeaf;delete window.__odPrevLeaf}return JSON.stringify({closed:true})})()"""


def js(template: str, payload) -> str:
    return template.replace("%DECODE%", DECODE.format(payload=b64(payload)))


def engine_info(bootstrap: str | None) -> dict:
    with Lock():
        info = ev(js(ENGINE_JS, {"bootstrap": bootstrap}))
    info["obsidian_version"] = cli(["version"], timeout=15).strip().split(" ")[0] or None
    return info


def live_check(blocks: list[Block], export: bool = False) -> str | None:
    engine = None
    chunk: list[Block] = []
    size = 0

    def flush():
        nonlocal engine, chunk, size
        if not chunk:
            return
        with Lock():
            res = ev(js(CHECK_JS, {"blocks": [b.source for b in chunk], "export": export, "layout": True}),
                     timeout=30 + (15 if export else 5) * len(chunk))
        engine = res.get("engine") or engine
        for b, r in zip(chunk, res.get("blocks", [])):
            b.live = r
        chunk, size = [], 0

    for b in blocks:
        n = len(b.source.encode())
        if chunk and size + n > CHUNK_BYTES:
            flush()
        chunk.append(b)
        size += n
    flush()
    return engine


def write_exports(blocks: list[Block], out_dir: Path) -> list[str]:
    """Save each rendered diagram as SVG plus light/dark PNGs (dark = Obsidian's invert filter, emulated)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for b in blocks:
        live = b.live or {}
        if not live.get("svg"):
            continue
        stem = re.sub(r"[^\w.-]+", "_", Path(b.note).stem).strip("_")[:60] + f"-diagram{b.index}"
        (out_dir / f"{stem}.svg").write_text(live.pop("svg"))
        for mode in ("light", "dark"):
            data = live.pop(f"png_{mode}", None)
            if data:
                (out_dir / f"{stem}-{mode}.png").write_bytes(base64.b64decode(data))
        written.append(stem)
    return written


def screenshot(note_rel: str, n_blocks: int) -> dict:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SHOT_DIR / (re.sub(r"[^\w.-]+", "_", note_rel) + f"-{int(time.time())}.png")
    with Lock():
        try:
            state = ev(js(SHOT_OPEN_JS, {"path": note_rel, "n": n_blocks}))
            time.sleep(0.4)
            cli(["dev:screenshot", f"path={path}"], timeout=20)  # always absolute: relative lands in the vault
        finally:
            ev(SHOT_CLOSE_JS)
    state["screenshot"] = str(path) if path.exists() else None
    return state


# --------------------------------------------------------------------------- main
def vault_root(arg: str | None, info: dict | None) -> Path:
    for cand in (arg, (info or {}).get("vault_path"), os.environ.get("OBSIDIAN_VAULT"), "~/TheBible"):
        if cand:
            return Path(cand).expanduser().resolve()
    raise SystemExit("no vault path")


def note_files(root: Path, notes: list[str], whole_vault: bool) -> list[Path]:
    if whole_vault:
        skip = {".obsidian", ".trash", ".git"}
        return sorted(p for p in root.rglob("*.md") if not skip & set(p.relative_to(root).parts))
    out = []
    for n in notes:
        p = Path(n).expanduser()
        if not p.is_absolute():
            p = root / p if (root / p).exists() or not p.exists() else p.resolve()
        if not p.exists():
            raise SystemExit(f"note not found: {p}")
        out.append(p.resolve())
    return out


def rel(root: Path, p: Path) -> str:
    try:
        return str(p.relative_to(root))
    except ValueError:
        return str(p)


def report_text(meta: dict, blocks: list[Block], shots: list[dict]) -> str:
    lines = []
    eng = meta.get("engine") or "unavailable"
    ver = meta.get("engine_version") or "?"
    lines.append(f"Obsidian {meta.get('obsidian_version') or '?'} · engine {eng} {ver if eng != 'unavailable' else ''}".rstrip())
    if meta.get("trusted") is False:
        lines.append("⚠ Mermaid rendering is not allowed in this vault yet: every diagram shows as source under "
                     "\"Display Mermaid diagrams in this vault? Allow\". Ask the user to click Allow once "
                     "(a vault trust decision — don't click it for them), or turn on the 'Show Mermaid diagrams in notes' setting.")
    if meta.get("warning"):
        lines.append("⚠ " + meta["warning"])
    by_note: dict[str, list[Block]] = {}
    for b in blocks:
        by_note.setdefault(b.note, []).append(b)
    totals = {"ok": 0, "error": 0}
    for note, bs in by_note.items():
        lines.append(f"\n{note}")
        for b in bs:
            live = b.live or {}
            status = "ok" if live.get("ok") else ("ERROR" if b.live else "not checked live")
            if live.get("ok"):
                totals["ok"] += 1
            elif b.live:
                totals["error"] += 1
            lines.append(f"  #{b.index} line {b.start_line} {b.keyword or '?'}: {status}")
            if b.live and not live.get("ok"):
                at = f" (diagram line {live['line']})" if live.get("line") else ""
                lines.append("     " + (live.get("error") or "failed").replace("\n", "\n     ") + at)
            for f in b.findings:
                lines.append(f"     [{f.severity}] {f.message}")
    if meta.get("exported") is not None:
        lines.append(f"\nexported {len(meta['exported'])} diagram(s) to {meta.get('export_dir')} (.svg, -light.png, -dark.png)")
        for b in blocks:
            if (b.live or {}).get("export_error"):
                lines.append(f"  #{b.index} export failed: {b.live['export_error']}")
    for s in shots:
        lines.append(f"\nscreenshot {s.get('note')}: {s.get('screenshot')} "
                     f"(rendered {s.get('rendered')}, guarded {s.get('guarded')})")
    lines.append(f"\n{len(blocks)} block(s) in {len(by_note)} note(s): {totals['ok']} ok, {totals['error']} failing live")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("notes", nargs="*")
    ap.add_argument("--vault", action="store_true")
    ap.add_argument("--source")
    ap.add_argument("--engine", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--static-only", action="store_true")
    ap.add_argument("--screenshot", action="store_true")
    ap.add_argument("--vault-path")
    ap.add_argument("--export", metavar="DIR", help="save each rendered diagram as .svg + -light.png + -dark.png")
    a = ap.parse_args(argv)
    if not (a.notes or a.vault or a.source or a.engine):
        ap.error("give note paths, --vault, --source or --engine")

    meta: dict = {}
    root = vault_root(a.vault_path, None)
    blocks: list[Block] = []
    if a.source:
        src = Path(a.source).expanduser().read_text()
        blocks = extract_blocks(src, a.source) or [Block(a.source, 1, 1, src.strip("\n"))]
    files = [] if a.engine and not (a.notes or a.vault) else note_files(root, a.notes, a.vault)
    for p in files:
        blocks += extract_blocks(p.read_text(errors="replace"), rel(root, p))
    for b in blocks:
        b.keyword = detect_keyword(b.source)
        b.family = TYPES.get(b.keyword, (None,))[0] if b.keyword else None

    live = False
    if not a.static_only:
        try:
            boot = next((b.note for b in blocks if b.note.endswith(".md") and not Path(b.note).is_absolute()), None)
            if boot is None:
                boot = next((rel(root, p) for p in note_files(root, [], True)
                             if "```mermaid" in p.read_text(errors="ignore")), None)
            meta = engine_info(boot)
            if meta.get("engine"):
                live = True
                if blocks:
                    meta["engine"] = live_check(blocks, export=bool(a.export)) or meta["engine"]
                    if a.export:
                        meta["exported"] = write_exports(blocks, Path(a.export).expanduser())
                        meta["export_dir"] = str(Path(a.export).expanduser().resolve())
            else:
                meta["warning"] = "Obsidian answered but no diagram engine could be loaded; static rules only"
        except ObsidianUnavailable as e:
            meta["warning"] = f"{e} — start it with `open -ga Obsidian` and re-run; static rules only for now"
    for b in blocks:
        static_rules(b, live and b.live is not None)
        explain_live_error(b)
        layout_findings(b)

    shots = []
    if a.screenshot and live:
        for note in dict.fromkeys(b.note for b in blocks if not Path(b.note).is_absolute() and b.note.endswith(".md")):
            n = sum(1 for b in blocks if b.note == note)
            shots.append({"note": note, **screenshot(note, n)})

    if a.json:
        print(json.dumps({"meta": meta, "blocks": [
            {k: v for k, v in asdict(b).items() if k != "source"} for b in blocks], "screenshots": shots}, indent=1))
    else:
        print(report_text(meta, blocks, shots))
    failing = any(b.live and not b.live.get("ok") for b in blocks) or any(
        f.severity == "error" for b in blocks for f in b.findings)
    if failing:
        return 1
    if not live and not a.static_only and (blocks or a.engine):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
