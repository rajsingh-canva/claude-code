#!/usr/bin/env python3
"""Layer 1: API JSON response sample -> Workato object_definition (or JSON Schema).

See references/workato-schema.md for the rules. stdlib only.

  python3 build_schema.py --input sample.json --target workato --out schema.workato.json
  pbpaste | python3 build_schema.py --target workato
"""
import argparse
import json
import re
import sys

DT = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")


def humanize(name):
    # split on underscores AND camelCase/PascalCase boundaries
    parts = [p for p in re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name).split("_") if p]
    out = []
    for i, p in enumerate(parts):
        if p.lower() == "id":
            out.append("ID")
        elif i == 0:
            out.append(p[:1].upper() + p[1:].lower())
        else:
            out.append(p.lower())
    return " ".join(out)


def is_dt(v):
    return isinstance(v, str) and bool(DT.match(v))


def guess_empty(name):
    n = name.lower()
    if n.endswith("_count") or n.endswith("count"):
        return ("integer", "number")
    if "datetime" in n or "_date" in n or "_time" in n or n.endswith("time"):
        return ("date_time", None)
    if n.startswith("is_") or n.startswith("enable") or n.endswith("_flag") or n.endswith("flag"):
        return ("boolean", None)
    return ("string", None)


def bool_field(name, label, mode):
    if mode == "embedded":
        return {
            "control_type": "text", "label": label,
            "render_input": "boolean_conversion", "parse_output": "boolean_conversion",
            "toggle_hint": "Select from option list",
            "toggle_field": {"label": label, "control_type": "text",
                             "toggle_hint": "Use custom value", "type": "boolean", "name": name},
            "type": "boolean", "name": name,
        }
    return {"control_type": "checkbox", "label": label, "type": "boolean", "name": name}


def dt_field(name, label):
    return {"control_type": "text", "label": label,
            "render_input": "date_time_conversion", "parse_output": "date_time_conversion",
            "type": "date_time", "name": name}


def infer(name, value, mode, warn):
    label = humanize(name)
    if isinstance(value, bool):
        return bool_field(name, label, mode)
    if isinstance(value, int):
        return {"control_type": "number", "label": label, "type": "integer", "name": name}
    if isinstance(value, float):
        return {"control_type": "number", "label": label, "type": "number", "name": name}
    if value is None or value == "":
        t, _ = guess_empty(name)
        warn.append(f"{name}: empty/null in sample -> guessed {t}")
        if t == "boolean":
            return bool_field(name, label, mode)
        if t == "date_time":
            return dt_field(name, label)
        if t == "integer":
            return {"control_type": "number", "label": label, "type": "integer", "name": name}
        return {"control_type": "text", "label": label, "type": "string", "name": name}
    if is_dt(value):
        return dt_field(name, label)
    if isinstance(value, str):
        ct = "text-area" if name == "body" else "text"
        return {"control_type": ct, "label": label, "type": "string", "name": name}
    if isinstance(value, list):
        if not value:
            warn.append(f"{name}: empty array -> guessed array of string")
            return {"control_type": "text", "label": label, "type": "array", "of": "string", "name": name}
        first = value[0]
        if isinstance(first, dict):
            return {"label": label, "type": "array", "name": name, "of": "object",
                    "properties": props(first, mode, warn)}
        of = ("boolean" if isinstance(first, bool) else "integer" if isinstance(first, int)
              else "number" if isinstance(first, float) else "string")
        return {"control_type": "text", "label": label, "type": "array", "of": of, "name": name}
    if isinstance(value, dict):
        return {"label": label, "type": "object", "name": name, "properties": props(value, mode, warn)}
    return {"control_type": "text", "label": label, "type": "string", "name": name}


def props(obj, mode, warn):
    return [infer(k, v, mode, warn) for k, v in obj.items()]


# ---- JSON Schema (draft 2020-12) ----
def js(value, name="", warn=None):
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, int):
        return {"type": "integer"}
    if isinstance(value, float):
        return {"type": "number"}
    if value is None or value == "":
        t, _ = guess_empty(name)
        m = {"boolean": "boolean", "integer": "integer", "date_time": "string", "string": "string"}[t]
        s = {"type": [m, "null"]}
        if t == "date_time":
            s["format"] = "date-time"
        return s
    if is_dt(value):
        return {"type": "string", "format": "date-time"}
    if isinstance(value, str):
        return {"type": "string"}
    if isinstance(value, list):
        return {"type": "array", "items": js(value[0], name, warn) if value else {}}
    if isinstance(value, dict):
        return {"type": "object",
                "properties": {k: js(v, k, warn) for k, v in value.items()},
                "additionalProperties": False}
    return {"type": "string"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    ap.add_argument("--target", choices=["workato", "jsonschema"], default="workato")
    ap.add_argument("--booleans", choices=["standalone", "embedded"], default="standalone")
    ap.add_argument("--name", default="Root")
    ap.add_argument("--out")
    args = ap.parse_args()

    raw = open(args.input).read() if args.input else sys.stdin.read()
    data = json.loads(raw)
    warn = []

    if args.target == "workato":
        if isinstance(data, dict):
            out = props(data, args.booleans, warn)
        elif isinstance(data, list) and data and isinstance(data[0], dict):
            out = [{"label": "Array", "type": "array", "name": "array", "of": "object",
                    "properties": props(data[0], args.booleans, warn)}]
        else:
            out = [infer(args.name, data, args.booleans, warn)]
        text = json.dumps(out, indent=2)
    else:
        schema = js(data, args.name, warn)
        schema = {"$schema": "https://json-schema.org/draft/2020-12/schema",
                  "title": args.name, **schema}
        text = json.dumps(schema, indent=2)

    for w in warn:
        print(f"[warn] {w}", file=sys.stderr)
    if args.out:
        open(args.out, "w").write(text + "\n")
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
