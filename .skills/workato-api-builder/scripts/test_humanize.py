#!/usr/bin/env python3
"""Unit test for build_schema.humanize — snake_case (Iru) must not regress; camelCase (Apple) must work.

Rule under test: split on `_` AND camelCase boundaries; capitalise the first word only,
lowercase the rest; any token equal to `id` -> `ID`. (Matches the one Workato oracle we
have — the snake_case Iru recipe — extended to camelCase the same way.)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_schema import humanize  # noqa: E402

CASES = {
    # snake_case — verified against the WKT-147 Get Device recipe; must not regress
    "device_id": "Device ID",
    "os_version": "Os version",
    "udid": "Udid",
    "x_total_count": "X total count",
    "mdm_enabled": "Mdm enabled",
    "last_check_in": "Last check in",
    "lost_mode_status": "Lost mode status",
    "id": "ID",
    # camelCase — Apple Business Manager field names (the bug)
    "defaultProductFamilies": "Default product families",
    "lastConnectedIp": "Last connected ip",
    "deviceCount": "Device count",
    "serverType": "Server type",
    "lastConnectedDateTime": "Last connected date time",
    "createdDateTime": "Created date time",
    "enableMdmDisownFlag": "Enable mdm disown flag",
    "serialNumber": "Serial number",
}


def main():
    failed = 0
    for name, want in CASES.items():
        got = humanize(name)
        ok = got == want
        print(f"{'PASS' if ok else 'FAIL'}  {name!r} -> {got!r}" + ("" if ok else f"  (want {want!r})"))
        if not ok:
            failed += 1
    print(f"\n{len(CASES)-failed}/{len(CASES)} cases passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
