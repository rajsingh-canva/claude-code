# Recipe-function template reference

The "FUNC" pattern `build_function.py` emits, and the spec that drives it.

## The pattern

A Workato **recipe function** (`provider: workato_recipe_function`) that:

1. **trigger** `execute` — declares input `parameters` and the function `result`.
2. **declare_variable** — one variable per `result` field (the error/output carriers).
3. **if / elsif / else** on inputs — each `when` branch fires a REST `make_request_v2` GET, then sets the error variable to `"False"`; the `else` sets it to the configured message.
4. **return_result** — maps each result field from its variable.

Step numbering is pre-order DFS (trigger 0, declare 1, if 2, make_request 3, update 4, elsif 5, …), matching Workato's exporter.

## Spec shape (`*.spec.json`)

```json
{
  "name": "WKT-147 | FUNC | Get Device",        // recipe name
  "connector": "Iru",                            // for output foldering only
  "description": "",                             // optional
  "connection": {                                 // REST connection the make_requests use
    "name": "EUC CONN | Kandji Production (canva.kandji.io)",
    "zip_name": "…/Kandji/euc_conn_kandji_production_canva_kandji_io.connection.json",
    "folder": "WKT-147 | Device Movements and Management/Global Connections/Kandji"
  },
  "inputs": [                                     // function parameters
    { "name": "iru_device_id", "label": "Iru Device ID", "type": "string", "optional": true }
  ],
  "branches": [                                   // one make_request per branch, in order
    { "when": "iru_device_id",                    // input that must be present
      "method": "GET",
      "url": "devices/{iru_device_id}",           // {input} → output pill
      "request_name": "Get Iru Device using Device ID",
      "schema": "Iru/iruDevices" }                // <schemas-dir>/Iru/iruDevices.workato.json
  ],
  "else_error": { "variable": "blank_device_error", "message": "Device Details are missing" },
  "result": [ { "name": "blank_device_error", "type": "string", "optional": false } ]
}
```

Notes:
- `branches[].schema` is the standalone envelope schema from `build_schema.py`. The builder extracts `response`→`array` for `response_schema` and `headers` for `headers_schema`, and converts booleans to the embedded form. Override the extraction with `"response_path": ["response","array"]` / `"headers_path": ["headers"]` if a connector's envelope differs.
- `{token}` in `url` interpolates the matching input as a `workato_recipe_function` output pill.
- Success branches set `else_error.variable` to `"False"`; the `else` sets it to `message`.

## ID regeneration

Every `as` (8-hex step handle) and `uuid` is freshly generated each build. Pills reference the trigger's and declare-variable's `as` ids, so they're wired from the generated values. Two builds of one spec differ **only** in these ids.

## Validating (round-trip)

`scripts/validate_roundtrip.py --spec … --schemas-dir … --original <known-good.recipe.json>` rebuilds the recipe and checks, against the oracle, that these match (order- and id-insensitive):

- `parameters_schema_json`, `result_schema_json`
- each branch's `response_schema` and `headers_schema`
- step provider/keyword sequence
- branch URLs (trigger-id normalised) and `request_name`s
- the `config` REST connection

It deliberately ignores `uuid`/`as` and pill line-ids. A pass proves the generator reproduces a human-built recipe from a spec + schema.

## Extending (beyond v1)

v1 = GET-lookup branches + error-variable + return_result. To add mutating functions (POST/PATCH), you'd add `request.body` handling + a request schema to the branch, and likely richer `result` mapping (returning the device, not just an error string). Add a **failing round-trip test against a known-good mutating recipe first** (Iron Law), then extend `build_function.py`. Don't half-support it.
