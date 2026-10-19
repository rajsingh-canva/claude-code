#!/usr/bin/env python3
"""Small, safe file operations for the Obsidian vault that the CLI gets wrong or makes fiddly.

Works on the files directly (Obsidian picks up changes on its own), so it doesn't need the app
running and never mangles backslashes, backticks or quotes the way `obsidian ... content=` does.

  vault_note.py append-index "3 - Tags/Claude Session.md" "2026-10-19 - My Session"
      Append the next numbered wikilink ("18. [[2026-10-19 - My Session]]") to an index note.
      Continues the existing numbering, removes stray blank lines at the end, skips duplicates.

  vault_note.py ensure-tag "Diagrams" ["Skills" ...]
      Create "3 - Tags/<Tag>.md" in the vault's tag style ("\\n# <Tag>") if it doesn't exist.

  vault_note.py append "7 - Context/My Note.md" < text.md      (or --file text.md)
      Append a block separated by one blank line (so headings and fences never collide),
      ending with a newline. --tight joins with a single newline instead (e.g. another list item).

Paths are vault-relative (no "TheBible/" prefix). Vault root: --vault, $OBSIDIAN_VAULT, or ~/TheBible.
Python 3.12+, stdlib only.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

TAGS_DIR = "3 - Tags"


def vault_root(arg: str | None) -> Path:
    root = Path(arg or os.environ.get("OBSIDIAN_VAULT") or "~/TheBible").expanduser()
    if not (root / ".obsidian").is_dir():
        sys.exit(f"not an Obsidian vault: {root}")
    return root


def note_path(root: Path, rel: str) -> Path:
    p = (root / rel).resolve()
    if root.resolve() not in p.parents:
        sys.exit(f"path escapes the vault: {rel}")
    return p if p.suffix == ".md" else p.with_suffix(".md")


def append_index(root: Path, index: str, target: str) -> None:
    p = note_path(root, index)
    text = p.read_text() if p.exists() else ""
    link = f"[[{target}]]"
    if link in text:
        print(f"already listed in {index}: {link}")
        return
    numbers = [int(n) for n in re.findall(r"^\s*(\d+)\.\s", text, re.M)]
    nxt = max(numbers, default=0) + 1
    body = text.rstrip("\n")
    line = f"{nxt}. {link}"
    p.write_text((body + "\n" if body else "") + line + ("\n" if text.endswith("\n") or not text else ""))
    print(f"{index}: {line}")


def ensure_tag(root: Path, tags: list[str]) -> None:
    for tag in tags:
        p = note_path(root, f"{TAGS_DIR}/{tag}")
        if p.exists():
            print(f"exists: {TAGS_DIR}/{p.name}")
            continue
        p.write_text(f"\n# {tag}\n")
        print(f"created: {TAGS_DIR}/{p.name}")


def append_text(root: Path, rel: str, text: str, tight: bool = False) -> None:
    p = note_path(root, rel)
    if not p.exists():
        sys.exit(f"note not found: {rel} (create it first)")
    current = p.read_text().rstrip("\n")
    sep = "" if not current else ("\n" if tight else "\n\n")
    p.write_text(current + sep + text.strip("\n") + "\n")
    print(f"appended {len(text.strip())} chars to {rel}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--vault")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("append-index"); a.add_argument("index"); a.add_argument("target")
    t = sub.add_parser("ensure-tag"); t.add_argument("tags", nargs="+")
    x = sub.add_parser("append"); x.add_argument("note"); x.add_argument("--file"); x.add_argument("--tight", action="store_true")
    args = ap.parse_args()
    root = vault_root(args.vault)
    if args.cmd == "append-index":
        append_index(root, args.index, args.target)
    elif args.cmd == "ensure-tag":
        ensure_tag(root, args.tags)
    else:
        text = Path(args.file).read_text() if args.file else sys.stdin.read()
        append_text(root, args.note, text, args.tight)


if __name__ == "__main__":
    main()
