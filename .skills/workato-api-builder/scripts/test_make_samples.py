#!/usr/bin/env python3
"""Unit test for make_samples.find_item_list / extract_one — multi-item list detection
across the connector envelopes we actually hit (Iru, Apple ABM, JSM Assets, bare array)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_samples import find_item_list, extract_one  # noqa: E402

CASES = [
    # (label, payload, expected_path, expected_first_item)
    ("iru_response_array", {"status_code": 200, "response": {"array": [{"device_id": "a"}, {"device_id": "b"}]}}, "response.array", {"device_id": "a"}),
    ("apple_data_array", {"data": [{"id": "1"}, {"id": "2"}], "meta": {"paging": {"limit": 100}}}, "data", {"id": "1"}),
    ("jsm_body_values", {"body": {"values": [{"id": "x"}, {"id": "y"}], "total": 2}, "headers": {}}, "body.values", {"id": "x"}),
    ("bare_array", [{"n": 1}, {"n": 2}], "", {"n": 1}),
]


def main():
    failed = 0
    for label, payload, want_path, want_item in CASES:
        path, lst = find_item_list(payload)
        _, one = extract_one(payload)
        ok = (path == want_path) and (one == want_item) and (lst is not None and len(lst) == 2)
        print(f"{'PASS' if ok else 'FAIL'}  {label}: path={path!r} one={one}")
        if not ok:
            failed += 1
            print(f"      want path={want_path!r} item={want_item}")
    # single-object payload (no list) must return (None, None) gracefully
    p, l = find_item_list({"data": {"type": "orgDevices", "id": "X"}})
    ok = p is None and l is None
    print(f"{'PASS' if ok else 'FAIL'}  single_object_no_list: path={p!r}")
    if not ok:
        failed += 1
    print(f"\n{'ALL PASS' if not failed else str(failed)+' FAILED'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
