---
name: mdm-profile-builder
description: Create, edit, and validate Apple MDM configuration profiles (.mobileconfig XML) for deployment via Kandji or any Apple MDM. Use when the user wants to create a new MDM profile, modify an existing profile, check compatibility of a profile with the current macOS version, or maintain the NotebookLM documentation notebook (add new branches, sync sources). Triggers on requests like "create a profile for X", "add a profile to restrict Y", "build a mobileconfig for Z", or "update the MDM notebook".
---

# MDM Profile Builder

## Workflow: Creating a Profile

### Step 1 — Identify the target
Determine what app or system behaviour to configure and what the desired outcome is (restrict, enforce, configure, disable, etc.).

### Step 2 — Find the PayloadType
Read `references/payload-types.md`. If the PayloadType is not listed there, query the NotebookLM notebook (see `references/notebooklm.md`) or find the app's bundle ID:
```bash
mdls -name kMDItemCFBundleIdentifier /Applications/App.app
```

### Step 3 — Check OS compatibility
1. Read the Nudge Production Config to get the minimum supported macOS version:
   - **Primary source**: A YAML file for the supported OS version (if it exists in the repo — this is the future state)
   - **Fallback source**: `kandji/custom-profiles/Nudge Production Config/nudge.mobileconfig`
     - Extract `requiredMinimumOSVersion` from `osVersionRequirements[]` where `targetedOSVersionsRule == "default"`
2. Query the NotebookLM notebook: *"Is `<PayloadType>` supported on macOS `<version>`? Are any of these keys deprecated: `<key list>`?"*
3. If a key is unavailable or deprecated: find the correct replacement before proceeding.

### Step 4 — Draft the profile XML
Read `references/profile-anatomy.md` for the full structure. At minimum every profile needs:
- A fresh UUID for the outer payload and each inner payload (`uuidgen` on macOS)
- Correct `PayloadType` on the inner payload (vendor bundle ID or Apple type)
- `PayloadRemovalDisallowed` set intentionally (`<true/>` for security/compliance profiles, `<false/>` for optional ones)

### Step 5 — Name and place the files
- Directory: Title Case human-readable name (e.g., `Disable Automatic Updates for Figma`)
- File: snake_case `.mobileconfig` (e.g., `disable_automatic_updates_figma.mobileconfig`)
- Place under `kandji/custom-profiles/<Directory Name>/`

---

## Workflow: Maintaining the NotebookLM Notebook

The `apple/device-management` GitHub repo adds a new `seed_OS-X.Y` branch for each macOS in development, and removes it once the OS is released (content merges into `release`). Run this maintenance check when creating profiles for an unreleased OS, or periodically to keep the notebook current.

### Step 1 — Check current branches
```bash
curl -s https://api.github.com/repos/apple/device-management/branches | python3 -c "import sys,json; [print(b['name']) for b in json.load(sys.stdin)]"
```

### Step 2 — Compare against notebook sources
Open the notebook in NotebookLM and check which GitHub branch URLs are already added as sources (see `references/notebooklm.md` for the notebook ID and how to list sources via CLI).

### Step 3 — Add new branches
For any branch not yet in the notebook:
```bash
source ~/work/notebooklm-py/.venv/bin/activate
notebooklm source add "https://github.com/apple/device-management/tree/<branch>" -n <notebook-id>
```

### Step 4 — Note stale branches
Seed branches are deleted when the OS ships. If a previously added `seed_OS-*` source returns errors or 404s in NotebookLM, it can be removed — the content is now in the `release` branch.

---

## References

- `references/profile-anatomy.md` — XML structure, required keys, naming conventions, Kandji variable substitution
- `references/payload-types.md` — Common Apple-native and third-party PayloadType values
- `references/notebooklm.md` — Notebook ID, CLI usage, example queries for payload documentation lookup
