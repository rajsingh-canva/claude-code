#!/usr/bin/env python3
"""Spec prep: from a saved API response, emit a single-item sample alongside the full list.

When a response holds many items (assets/devices/objects), you usually want to curate the
fields on ONE item by hand, then apply the same trims to the full file. This writes that
single-item file so the curation loop is easy. stdlib only.

  python3 make_samples.py --input atlassian_jira_assets_get_assets.json
  # -> writes atlassian_jira_assets_get_assets_one_item.json (first item, bare object)

Auto-detects the item list across the envelopes we hit; override with --item-path a.b.c
"""
import argparse
import json
import sys
from pathlib import Path

# priority order — checked before the recursive fallback
ITEM_PATHS = [["body", "values"], ["response", "array"], ["data"], ["values"], ["results"], ["items"], ["objects"]]


def resolve(data, path):
    cur = data
    for seg in path:
        if not isinstance(cur, dict) or seg not in cur:
            return None
        cur = cur[seg]
    return cur


def _largest_list_of_dicts(node, prefix, best):
    """Fallback: deepest/largest array of objects anywhere in the tree."""
    if isinstance(node, list):
        if node and all(isinstance(i, dict) for i in node) and len(node) > best[1]:
            best = (prefix, len(node), node)
    elif isinstance(node, dict):
        for k, v in node.items():
            best = _largest_list_of_dicts(v, f"{prefix}.{k}" if prefix else k, best)
    return best


def find_item_list(data):
    """Return (dotted_path, list) for the item array, or (None, None) if there isn't one.

    Top-level array => path "". Known envelopes win; otherwise the largest array of objects.
    """
    if isinstance(data, list):
        return ("", data) if data and all(isinstance(i, dict) for i in data) else (None, None)
    for p in ITEM_PATHS:
        v = resolve(data, p)
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return (".".join(p), v)
    path, count, lst = _largest_list_of_dicts(data, "", (None, 0, None))
    return (path, lst) if lst else (None, None)


def extract_one(data, item_path=None):
    if item_path is not None:
        lst = data if item_path == "" else resolve(data, item_path.split("."))
        path = item_path
    else:
        path, lst = find_item_list(data)
    if not lst:
        return path, None
    return path, lst[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--item-path", help="dotted path to the item list, e.g. body.values (overrides auto-detect)")
    ap.add_argument("--out", help="output path (default <input>_one_item.json)")
    args = ap.parse_args()

    data = json.loads(Path(args.input).read_text())
    path, lst = (args.item_path, (data if args.item_path == "" else resolve(data, args.item_path.split(".")))) if args.item_path is not None else find_item_list(data)

    if not lst:
        print(f"No item list found in {args.input} (single-object response?). Nothing to extract.", file=sys.stderr)
        sys.exit(1)

    one = lst[0]
    out = args.out or str(Path(args.input).with_name(Path(args.input).stem + "_one_item.json"))
    Path(out).write_text(json.dumps(one, indent=2) + "\n")
    print(f"item list: {path or '(top-level array)'}  ({len(lst)} items)")
    print(f"wrote single item -> {out}")


if __name__ == "__main__":
    main()
