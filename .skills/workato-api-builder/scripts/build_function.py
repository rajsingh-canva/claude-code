#!/usr/bin/env python3
"""Layer 2: spec.json + schema -> import-ready Workato recipe function (FUNC).

See references/recipe-template.md. stdlib only.

  python3 build_function.py --spec get_device.spec.json --schemas-dir DIR --out out.recipe.json
"""
import argparse
import itertools
import json
import os
import re
import uuid
from pathlib import Path


def gen_as():
    return os.urandom(4).hex()


def gen_uuid():
    return str(uuid.uuid4())


def compact(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def dp(provider, line, path):
    inner = compact({"pill_type": "output", "provider": provider, "line": line, "path": path})
    return "#{_dp('" + inner + "')}"


# ---- schema extraction + boolean conversion ----
def walk(fields, path):
    node = None
    for seg in path:
        node = next(f for f in fields if f["name"] == seg)
        fields = node.get("properties", [])
    return node


def to_embedded(field):
    f = dict(field)
    if f.get("type") == "boolean":
        label, name = f.get("label", f["name"]), f["name"]
        return {
            "control_type": "text", "label": label,
            "render_input": "boolean_conversion", "parse_output": "boolean_conversion",
            "toggle_hint": "Select from option list",
            "toggle_field": {"label": label, "control_type": "text",
                             "toggle_hint": "Use custom value", "type": "boolean", "name": name},
            "type": "boolean", "name": name,
        }
    if f.get("properties"):
        f["properties"] = [to_embedded(p) for p in f["properties"]]
    return f


# ---- static make_request override block ----
def response_override():
    learn = ('Select expected format of data response type, e.g. JSON or XML. '
             '<a href="https://docs.workato.com/developing-connectors/http.html#response-type" '
             'target="_blank">Learn more</a>')
    enc = ('Default encoding type is set to UTF-8, and typically doesn\'t need to be changed. '
           '<a href="https://docs.workato.com/developing-connectors/http.html#response-type" '
           'target="_blank">Learn more</a>')
    mark = ("If <b>yes</b>, non 2xx response codes returned will be marked as a successful action. "
            "If <b>no</b>, non 2xx response codes returned will be marked as an error.")
    return [{
        "label": "Response", "name": "response", "override": True,
        "properties": [
            {"control_type": "select", "label": "Response content type",
             "pick_list": [["Text", "rawdatatxt"], ["Binary", "rawdata"], ["JSON", "json"],
                           ["XML", "xml2"], ["Multipart", "multipart"]],
             "hint": learn, "default": "json", "extends_schema": True, "type": "string", "name": "output_type"},
            {"control_type": "select", "label": "Encoding",
             "pick_list": "supported_encodings_without_binary_global_pick_list",
             "pick_list_connection_less": True, "optional": True, "default": "UTF-8",
             "hint": enc, "type": "string", "name": "expected_encoding"},
            {"control_type": "schema-designer", "label": "Response schema", "sample_data_type": "json_http",
             "extends_schema": True, "empty_schema_title": "Describe all fields in your response.",
             "optional": True, "sticky": True, "type": "string", "name": "response_schema"},
            {"control_type": "schema-designer", "label": "HTTP response headers", "extends_schema": True,
             "empty_schema_title": "Describe all the response headers", "optional": True, "sticky": True,
             "type": "string", "name": "headers_schema"},
            {"control_type": "schema-designer", "label": "Multipart part headers", "extends_schema": True,
             "empty_schema_title": "Describe headers within each multipart part", "optional": True, "sticky": True,
             "hint": "Define the headers that appear in each part of the multipart response (e.g., Content-Type, Content-ID)",
             "ngIf": "input.response.output_type == 'multipart'", "type": "string", "name": "part_headers_schema"},
            {"control_type": "checkbox", "label": "Mark non-2xx response codes as success?", "default": "false",
             "hint": mark, "optional": True, "toggle_hint": "Select from option list",
             "toggle_field": {"label": "Mark non-2xx response codes as success?", "control_type": "text",
                              "toggle_hint": "Use custom value", "default": False, "hint": mark, "optional": True,
                              "render_input": None, "parse_output": None, "type": "boolean", "name": "ignore_http_errors"},
             "type": "boolean", "name": "ignore_http_errors"}],
        "type": "object"}]


def make_request_step(number, branch, trigger_as, schemas_dir):
    schema = json.loads((schemas_dir / (branch["schema"] + ".workato.json")).read_text())
    body = walk(schema, branch.get("response_path", ["response", "array"]))
    headers = walk(schema, branch.get("headers_path", ["headers"]))["properties"]
    emb_body = to_embedded(body)
    emb_headers = [to_embedded(h) for h in headers]

    url = branch["url"]
    for token in [seg.strip("{}") for seg in re.findall(r"\{[^}]+\}", branch["url"])]:
        url = url.replace("{" + token + "}", dp("workato_recipe_function", trigger_as, ["parameters", token]))

    return {
        "number": number, "provider": "rest", "name": "make_request_v2", "as": gen_as(), "keyword": "action",
        "toggleCfg": {"response.ignore_http_errors": True, "disable_retries": True},
        "input": {
            "request_name": branch["request_name"],
            "request": {"method": branch.get("method", "GET"),
                        "content_type": branch.get("content_type", "application/json"), "url": url},
            "response": {"output_type": "json", "expected_encoding": "UTF-8", "ignore_http_errors": "false",
                         "response_schema": compact([emb_body]), "headers_schema": compact(emb_headers)},
            "wait_for_response": "false", "completion_threshold_seconds": "3600",
            "disable_retries": "false", "enable_streaming": "false"},
        "extended_output_schema": [
            {"label": "Headers", "name": "headers", "properties": emb_headers, "type": "object"},
            {"label": "Response", "name": "response", "properties": [emb_body], "type": "object"}],
        "extended_input_schema": response_override(),
        "uuid": gen_uuid(), "wizardFinished": True,
    }


def update_var_step(number, var, value, declare_uuid, declare_as, declare_ui_num):
    ref = f"{declare_uuid}:{declare_as}:{var}"
    return {
        "number": number, "provider": "workato_variable", "name": "update_variables", "as": gen_as(),
        "keyword": "action",
        "dynamicPickListSelection": {"name": [{"label": f"{var} (step {declare_ui_num})", "value": ref}]},
        "input": {"input_mode": "raw", "name": ref, var: value},
        "extended_input_schema": [{
            "control_type": "text",
            "hint": ("Provide a value for the variable. When the value is not supplied, the variable is not updated."
                     "<br>To clear the value, set the value to <b>nil</b> in formula mode."),
            "label": var, "name": var, "optional": True, "sticky": True, "type": "string",
            "strip_interpolation": True}],
        "uuid": gen_uuid(),
    }


def present_cond(trigger_as, inp):
    return {"type": "compound", "operand": "and",
            "conditions": [{"operand": "present",
                            "lhs": dp("workato_recipe_function", trigger_as, ["parameters", inp]),
                            "rhs": "", "uuid": gen_uuid()}]}


def build(spec, schemas_dir):
    schemas_dir = Path(schemas_dir)
    trigger_as = gen_as()
    declare_as = gen_as()
    declare_uuid = gen_uuid()
    err_var = spec["else_error"]["variable"]
    result_fields = spec["result"]
    var_names = [f["name"] for f in result_fields]
    declare_ui_num = 2  # declare is json step 1 -> Workato UI "step 2"

    counter = itertools.count(1)

    # step 1: declare_variable
    var_schema = [{"name": v, "type": "string", "optional": True, "label": v,
                   "details": {"real_name": v}, "control_type": "text",
                   "parent": ["variables", "data"]} for v in var_names]
    declare = {
        "number": next(counter), "provider": "workato_variable", "name": "declare_variable",
        "as": declare_as, "keyword": "action",
        "input": {"variables": {"schema": compact(var_schema)}},
        "extended_output_schema": [{"control_type": "text", "label": v, "name": v, "optional": True,
                                    "type": "string", "details": {"real_name": v}} for v in var_names],
        "extended_input_schema": [{
            "add_field_label": "Add a variable", "control_type": "form-schema-builder",
            "empty_schema_title": "Add variables by giving them a name, type and default value",
            "exclude_fields": ["hint"], "item_label": "variable", "label": "Variables",
            "mark_as_required": True, "name": "variables", "ngIf": "!input.name", "optional": True,
            "properties": [
                {"control_type": "text", "label": "Schema", "extends_schema": True,
                 "broadcast_change_event": True, "type": "string", "name": "schema"},
                {"properties": [{"control_type": "text", "label": v, "name": v, "type": "string",
                                 "optional": True, "details": {"real_name": v},
                                 "parent": ["variables", "data"],
                                 "hint": "Defaults to nil if not supplied.", "sticky": True} for v in var_names],
                 "label": "Data", "type": "object", "name": "data"}],
            "type": "object"}],
        "visible_config_fields": [f"variables.data.{v}" for v in var_names],
        "uuid": declare_uuid,
    }

    branches = spec["branches"]
    # if step (the first branch); subsequent branches become elsif; then else.
    if_step = {"number": next(counter), "keyword": "if",
               "input": present_cond(trigger_as, branches[0]["when"]), "block": [], "uuid": gen_uuid()}
    if_block = if_step["block"]
    if_block.append(make_request_step(next(counter), branches[0], trigger_as, schemas_dir))
    if_block.append(update_var_step(next(counter), err_var, "False", declare_uuid, declare_as, declare_ui_num))

    for br in branches[1:]:
        elsif = {"number": next(counter), "keyword": "elsif",
                 "input": present_cond(trigger_as, br["when"]), "block": [], "uuid": gen_uuid()}
        elsif["block"].append(make_request_step(next(counter), br, trigger_as, schemas_dir))
        elsif["block"].append(update_var_step(next(counter), err_var, "False",
                                              declare_uuid, declare_as, declare_ui_num))
        if_block.append(elsif)

    else_step = {"number": next(counter), "keyword": "else", "input": {}, "block": [], "uuid": gen_uuid()}
    else_step["block"].append(update_var_step(next(counter), err_var, spec["else_error"]["message"],
                                             declare_uuid, declare_as, declare_ui_num))
    if_block.append(else_step)

    # return_result
    result_props = [{"control_type": "text", "label": f["name"], "name": f["name"], "type": "string",
                     "optional": f.get("optional", False)} for f in result_fields]
    return_step = {
        "number": next(counter), "provider": "workato_recipe_function", "name": "return_result",
        "as": gen_as(), "keyword": "action",
        "input": {"result": {v: dp("workato_variable", declare_as, [v]) for v in var_names}},
        "extended_output_schema": [{"label": "Result", "name": "result", "properties": result_props, "type": "object"}],
        "extended_input_schema": [{"label": "Result", "name": "result", "properties": result_props, "type": "object"}],
        "uuid": gen_uuid(),
    }

    params = [{"name": i["name"], "type": i.get("type", "string"), "optional": i.get("optional", True),
               "label": i["label"], "control_type": "text"} for i in spec["inputs"]]
    result_schema = [{"name": f["name"], "type": f.get("type", "string"),
                      "optional": f.get("optional", False), "label": f["name"], "control_type": "text"}
                     for f in result_fields]

    recipe = {
        "name": spec["name"], "description": spec.get("description", ""), "version": 1,
        "private": True, "concurrency": 1,
        "code": {
            "number": 0, "provider": "workato_recipe_function", "name": "execute", "as": trigger_as,
            "keyword": "trigger",
            "input": {"parameters_schema_json": compact(params), "result_schema_json": compact(result_schema)},
            "extended_output_schema": [{
                "label": "Parameters", "name": "parameters",
                "properties": [{"control_type": "text", "label": i["label"], "name": i["name"],
                                "type": i.get("type", "string"), "optional": i.get("optional", True)}
                               for i in spec["inputs"]],
                "type": "object"}],
            "block": [declare, if_step, return_step],
            "uuid": gen_uuid()},
        "config": [
            {"keyword": "application", "provider": "workato_recipe_function", "skip_validation": False, "account_id": None},
            {"keyword": "application", "provider": "rest", "skip_validation": False, "account_id": spec["connection"]},
            {"keyword": "application", "provider": "workato_variable", "skip_validation": False, "account_id": None}],
    }
    return recipe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--schemas-dir", required=True)
    ap.add_argument("--out")
    args = ap.parse_args()
    recipe = build(json.loads(Path(args.spec).read_text()), args.schemas_dir)
    text = json.dumps(recipe, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text + "\n")
        print(f"wrote {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
