---
name: workato-api-builder
description: Use when building a Workato output schema (object_definition) from an API JSON response, turning an API response into datapills, scaffolding a reusable Workato "FUNC" recipe function that calls a REST connection (e.g. GET-lookup functions for Iru/Kandji or Apple Business Manager), or saving/curating a multi-item API response (assets/devices/objects) down to the fields to keep. Triggers include a pasted or saved API response, a *.recipe.json or object_definition, "schema for this endpoint", or "make a Workato function".
---

# Workato API Builder

Generator for Workato artifacts. Each layer runs on its own; later layers consume earlier output.

- **Layer 0 — `make_samples.py`**: a saved API response → a single-item sample beside the full list. For multi-item responses you curate fields on one item, then apply the same trims to the full file.
- **Layer 1 — `build_schema.py`**: API JSON response sample → schema file. Targets: Workato `object_definition` (the field-array format Workato's schema-designer uses) and JSON Schema draft 2020-12.
- **Layer 2 — `build_function.py`**: a small `*.spec.json` + a schema → an import-ready `*.recipe.json` Workato **recipe function** (the "FUNC" pattern: `workato_recipe_function` trigger → branch on inputs → REST `make_request_v2` → `return_result`).

## When to use which

| You have… | You want… | Run |
|---|---|---|
| A saved multi-item response | One item to curate fields on | Layer 0 |
| A pasted/curated API response | Datapills / output schema | Layer 1 |
| A schema + endpoint details | A reusable recipe function | Layer 2 |
| Just an API response | The whole function | Layer 1 → Layer 2 |

## Layer 0 — save the full response + a single-item sample

When an API call returns many items (assets/devices/objects), save the full response under `specs/<connector>/`, then create a single-item companion to curate which fields to keep:

```bash
python3 scripts/make_samples.py --input specs/Atlassian/atlassian_jira_assets_get_assets.json
# -> writes ...get_assets_one_item.json  (first item, bare object)
```

It auto-detects the item list (`body.values`, `response.array`, `data`, top-level array, …); override with `--item-path a.b.c`. Curate fields on the one-item file, then apply the **same** deletions to the full file (e.g. one recursive `pop` per removed key) so the two stay in sync before Layer 1.

## Layer 1 — generate a schema

```bash
python3 scripts/build_schema.py --input sample.json --target workato --out schema.workato.json
# stdin also works:  pbpaste | python3 scripts/build_schema.py --target workato
```

Options:
- `--target workato|jsonschema` (default `workato`)
- `--booleans standalone|embedded` (default `standalone`) — see references/workato-schema.md. Use `embedded` only if you want the make-request form directly; Layer 2 converts automatically, so leave it `standalone`.
- `--name "OrgDevice"` — title for `--target jsonschema`.

Type inference, label humanisation (matches Workato: `os_version`→"Os version", `device_id`→"Device ID"), date-time detection, and null-field handling are documented in **references/workato-schema.md**. Read it before hand-editing output.

**Optional/required precedence** (when emitting JSON Schema `required[]`): a provided spec's `required[]` → fields null/empty/absent in the sample are optional → anything still ambiguous, list it and ask the user. A single sample is a weak signal — never assert requiredness from one example without saying so.

## Layer 2 — generate a recipe function

```bash
python3 scripts/build_function.py --spec path/to/get_device.spec.json \
  --schemas-dir ~/work/personal/workato/schemas \
  --out ~/work/personal/workato/functions/Iru/wkt_xxx_func_get_device.recipe.json
```

The spec carries only what a JSON response can't (name, connection, inputs, branch URLs, error message). Its full shape and the recipe skeleton are in **references/recipe-template.md**. Minimal example:

```json
{
  "name": "WKT-147 | FUNC | Get Device",
  "connector": "Iru",
  "connection": { "name": "...", "zip_name": "...", "folder": "..." },
  "inputs": [ { "name": "iru_device_id", "label": "Iru Device ID", "type": "string", "optional": true } ],
  "branches": [ { "when": "iru_device_id", "method": "GET", "url": "devices/{iru_device_id}", "request_name": "Get Iru Device using Device ID", "schema": "Iru/iruDevices" } ],
  "else_error": { "variable": "blank_device_error", "message": "Device Details are missing" },
  "result": [ { "name": "blank_device_error", "type": "string", "optional": false } ]
}
```

`branches[].schema` resolves to `<schemas-dir>/<schema>.workato.json`. `{token}` in `url` interpolates the matching input as a Workato output pill.

## Conventions

- Store specs in `personal/workato/specs/<connector>/`, generated functions in `personal/workato/functions/<connector>/`, schemas in `personal/workato/schemas/<connector>/`.
- Every build regenerates `uuid` and `as` ids, so two runs of the same spec differ only in those ids. Validate round-trips with a key-sorted, id-stripped diff (see references/recipe-template.md → "Validating").

## Scope (v1)

Supports the **GET-lookup FUNC pattern**: N input-conditioned branches, each a single GET, plus an error-variable `else` and `return_result`. **Out of scope:** mutating functions (POST/PATCH/DELETE), pagination loops, multi-step orchestration, and SDK custom-connector `connector.rb` generation. Extend deliberately — see references/recipe-template.md → "Extending".
