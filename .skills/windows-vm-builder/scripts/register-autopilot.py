#!/opt/homebrew/bin/python3.12
"""Register a Windows Autopilot device identity via Microsoft Graph API.

Reads hardware hash JSON (from extract-hwid.ps1) and registers the device
with the Autopilot service using client credentials authentication.

Usage:
    python3.12 register-autopilot.py --input hwid.json
    python3.12 register-autopilot.py --input hwid.json --group-tag "VirtualMachines"
    python3.12 register-autopilot.py --input hwid.json --dry-run

Environment variables required:
    AZURE_TENANT_ID     - Entra ID tenant ID
    AZURE_CLIENT_ID     - App registration client ID
    AZURE_CLIENT_SECRET - App registration client secret
"""

import argparse
import json
import os
import sys
import time

try:
    import msal
    import requests
except ImportError:
    print("Required packages: pip install msal requests", file=sys.stderr)
    sys.exit(1)

GRAPH_API_BASE = "https://graph.microsoft.com/beta"
AUTOPILOT_IMPORT_ENDPOINT = f"{GRAPH_API_BASE}/deviceManagement/importedWindowsAutopilotDeviceIdentities"
SCOPES = ["https://graph.microsoft.com/.default"]


def get_access_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    app = msal.ConfidentialClientApplication(
        client_id,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=client_secret,
    )
    result = app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" not in result:
        print(f"Authentication failed: {result.get('error_description', 'Unknown error')}", file=sys.stderr)
        sys.exit(1)
    return result["access_token"]


def import_autopilot_device(
    token: str,
    serial_number: str,
    hardware_hash: str,
    group_tag: str = "",
) -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "serialNumber": serial_number,
        "hardwareIdentifier": hardware_hash,
    }
    if group_tag:
        payload["groupTag"] = group_tag

    response = requests.post(AUTOPILOT_IMPORT_ENDPOINT, headers=headers, json=payload)
    response.raise_for_status()
    return response.json()


def poll_import_status(token: str, import_id: str, max_wait: int = 300) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{AUTOPILOT_IMPORT_ENDPOINT}/{import_id}"
    start = time.time()

    while time.time() - start < max_wait:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        state = data.get("state", {}).get("deviceImportStatus", "unknown")

        if state in ("complete", "completed"):
            print(f"Import completed successfully. Device registered.")
            return data
        elif state in ("error", "failed"):
            print(f"Import failed: {data.get('state', {}).get('deviceErrorCode', 'unknown')}", file=sys.stderr)
            sys.exit(1)

        print(f"Import status: {state}. Waiting...")
        time.sleep(10)

    print("Import timed out.", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Register Autopilot device via Graph API")
    parser.add_argument("--input", required=True, help="Path to hardware hash JSON file")
    parser.add_argument("--group-tag", default="", help="Autopilot group tag for dynamic group assignment")
    parser.add_argument("--dry-run", action="store_true", help="Print payload without sending")
    args = parser.parse_args()

    with open(args.input) as f:
        hwid = json.load(f)

    serial = hwid["serialNumber"]
    hardware_hash = hwid["hardwareHash"]

    print(f"Device: {hwid.get('manufacturer', 'Unknown')} {hwid.get('model', 'Unknown')}")
    print(f"Serial: {serial}")
    print(f"Hash length: {len(hardware_hash)} chars")

    if args.group_tag:
        print(f"Group tag: {args.group_tag}")

    if args.dry_run:
        payload = {"serialNumber": serial, "hardwareIdentifier": hardware_hash}
        if args.group_tag:
            payload["groupTag"] = args.group_tag
        print("\n--- DRY RUN ---")
        print(f"POST {AUTOPILOT_IMPORT_ENDPOINT}")
        print(json.dumps(payload, indent=2)[:500] + "...")
        return

    tenant_id = os.environ.get("AZURE_TENANT_ID")
    client_id = os.environ.get("AZURE_CLIENT_ID")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET")

    if not all([tenant_id, client_id, client_secret]):
        print("Missing environment variables: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET", file=sys.stderr)
        sys.exit(1)

    print("Authenticating with Entra ID...")
    token = get_access_token(tenant_id, client_id, client_secret)

    print("Importing device to Autopilot...")
    result = import_autopilot_device(token, serial, hardware_hash, args.group_tag)
    import_id = result.get("id")

    if import_id:
        print(f"Import ID: {import_id}")
        poll_import_status(token, import_id)
    else:
        print("Import submitted but no ID returned.")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
