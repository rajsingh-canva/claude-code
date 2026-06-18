#!/usr/bin/env python3
"""Round-trip test: rebuild a recipe from a spec+schema and compare to a known-good oracle.

Proves build_function.py reproduces a human-built Workato recipe function. Ignores
volatile ids (uuid/as) and pill line-ids; compares the meaningful, import-relevant fields.

Usage:
  validate_roundtrip.py --spec SPEC --schemas-dir DIR --original RECIPE.json
Exit 0 = all checks pass.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_function  # noqa: E402


def canon(x):
    """Order- and id-insensitive canonical form."""
    if isinstance(x, dict):
        return {k: canon(v) for k, v in sorted(x.items()) if k not in ("uuid", "as")}
    if isinstance(x, list):
        if x and all(isinstance(i, dict) and "name" in i for i in x):
            return [canon(i) for i in sorted(x, key=lambda d: d["name"])]
        return [canon(i) for i in x]
    if isinstance(x, str):
        return re.sub(r'("line":")[0-9a-f]{6,}(")', r"\1ID\2", x)
    return x


def find_make_requests(node, out):
    if isinstance(node, dict):
        if node.get("provider") == "rest" and node.get("name") == "make_request_v2":
            req = node["input"]["request"]
            resp = node["input"]["response"]
            out.append({
                "request_name": node["input"].get("request_name"),
                "url": re.sub(r'("line":")[0-9a-f]{6,}(")', r"\1ID\2", req["url"]),
                "method": req["method"],
                "response_schema": canon(json.loads(resp["response_schema"])),
                "headers_schema": canon(json.loads(resp["headers_schema"])),
            })
        for v in node.values():
            find_make_requests(v, out)
    elif isinstance(node, list):
        for v in node:
            find_make_requests(v, out)


def step_sequence(node, out):
    if isinstance(node, dict):
        if "keyword" in node and node.get("keyword") != "trigger":
            out.append((node.get("keyword"), node.get("provider"), node.get("name")))
        for k in ("block",):
            if k in node:
                step_sequence(node[k], out)
    elif isinstance(node, list):
        for v in node:
            step_sequence(v, out)


def rest_conn(recipe):
    for c in recipe.get("config", []):
        if c.get("provider") == "rest":
            return c.get("account_id")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--schemas-dir", required=True)
    ap.add_argument("--original", required=True)
    args = ap.parse_args()

    built = build_function.build(json.loads(Path(args.spec).read_text()), Path(args.schemas_dir))
    orig = json.loads(Path(args.original).read_text())

    checks = []

    def chk(name, a, b):
        ok = a == b
        checks.append((name, ok, a, b))

    chk("parameters_schema_json",
        canon(json.loads(built["code"]["input"]["parameters_schema_json"])),
        canon(json.loads(orig["code"]["input"]["parameters_schema_json"])))
    chk("result_schema_json",
        canon(json.loads(built["code"]["input"]["result_schema_json"])),
        canon(json.loads(orig["code"]["input"]["result_schema_json"])))

    bmr, omr = [], []
    find_make_requests(built["code"], bmr)
    find_make_requests(orig["code"], omr)
    bmr.sort(key=lambda d: d["request_name"] or "")
    omr.sort(key=lambda d: d["request_name"] or "")
    chk("make_request count", len(bmr), len(omr))
    for i, (b, o) in enumerate(zip(bmr, omr)):
        chk(f"branch[{i}] request_name", b["request_name"], o["request_name"])
        chk(f"branch[{i}] url", b["url"], o["url"])
        chk(f"branch[{i}] method", b["method"], o["method"])
        chk(f"branch[{i}] response_schema", b["response_schema"], o["response_schema"])
        chk(f"branch[{i}] headers_schema", b["headers_schema"], o["headers_schema"])

    bseq, oseq = [], []
    step_sequence(built["code"], bseq)
    step_sequence(orig["code"], oseq)
    chk("step sequence", bseq, oseq)
    chk("rest connection", rest_conn(built), rest_conn(orig))

    failed = 0
    for name, ok, a, b in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failed += 1
            print(f"      built : {json.dumps(a)[:300]}")
            print(f"      oracle: {json.dumps(b)[:300]}")
    print(f"\n{len(checks)-failed}/{len(checks)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
