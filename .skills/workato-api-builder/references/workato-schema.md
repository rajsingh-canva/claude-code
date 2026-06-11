# Workato schema reference

How `build_schema.py` maps JSON → Workato `object_definition`, and the rules to keep output import-compatible.

## Type inference

| JSON value | Workato field |
|---|---|
| `true`/`false` | `boolean` (form depends on `--booleans`, below) |
| integer | `{ "control_type": "number", "type": "integer" }` |
| float | `{ "control_type": "number", "type": "number" }` |
| ISO date-time string | `{ "control_type": "text", "type": "date_time", "render_input": "date_time_conversion", "parse_output": "date_time_conversion" }` |
| other string | `{ "control_type": "text", "type": "string" }` |
| `[ scalar, … ]` | `{ "type": "array", "of": "string"\|"integer"\|"number"\|"boolean" }` |
| `[ {…}, … ]` | `{ "type": "array", "of": "object", "properties": [ … ] }` |
| `{ … }` | `{ "type": "object", "properties": [ … ] }` (no `control_type` on object/array wrappers) |
| `null` / `""` / `[]` | typed by **name heuristic**, flagged in stderr (see below) |

**Date-time detection:** matches `YYYY-MM-DD`, `T` or space separator, `HH:MM:SS`, optional `.ffffff`, optional `Z`/`±HH:MM` offset. Apple uses `...+00:00`; Iru's raw `body` uses a space separator — both detected.

## Null / empty fields

A single sample can't reveal the type of a `null`, `""`, or `[]` field. The builder infers from the field name (`*_count`→integer, `*_date*`/`*_time*`/`*DateTime`→date_time, `is_*`/`*_flag`/`enable*`→boolean, `*s` plural on an empty array→array of string) and **prints each guess to stderr**. Always eyeball these; a populated sample beats a guess. This is the "heuristic" tier of the optional/required precedence in SKILL.md.

## Label humanisation (must match Workato)

Workato's schema-designer humanises field names a specific way; `build_function.py` embeds schemas into recipes that Workato re-reads, so labels must match or diffs/round-trips drift:

- split on `_`; capitalise the **first** word only, lowercase the rest
- any token equal to `id` → `ID`

Examples: `device_id`→"Device ID", `os_version`→"Os version", `udid`→"Udid", `x_total_count`→"X total count", `mdm_enabled`→"Mdm enabled", `last_check_in`→"Last check in".

## Booleans: standalone vs embedded

Workato has two boolean encodings. `--booleans` picks which `build_schema.py` emits; `build_function.py` always converts to **embedded** when writing a recipe (that's what the schema-designer produces inside `make_request`).

- `standalone`: `{ "control_type": "checkbox", "type": "boolean", "label": …, "name": … }` — compact, fine for an `object_definition` you paste into a connector.
- `embedded`: the make-request form —
  ```json
  { "control_type": "text", "label": "Mdm enabled",
    "render_input": "boolean_conversion", "parse_output": "boolean_conversion",
    "toggle_hint": "Select from option list",
    "toggle_field": { "label": "Mdm enabled", "control_type": "text", "toggle_hint": "Use custom value", "type": "boolean", "name": "mdm_enabled" },
    "type": "boolean", "name": "mdm_enabled" }
  ```

## The HTTP envelope

Workato's REST `make_request` returns `{ status_code, error, headers, body, response }`. A response sample captured from a recipe (like the Iru device payload) carries that whole envelope. `build_schema.py` models it faithfully (with `body` as a `text-area` string — it's a stringified duplicate of `response`). `build_function.py` then **splits** it: the body shape becomes the make-request `response_schema`, and `headers` becomes `headers_schema` — they are not one nested object inside a recipe. See references/recipe-template.md.

## Polymorphic fields

If a field is sometimes an object and sometimes `""`/`null` (e.g. Iru `user` on shared/room devices), model it as the **object** — that yields usable datapills; on the scalar records those pills resolve blank. Workato schemas can't express "object OR string". Note it in stderr rather than dropping the field.
