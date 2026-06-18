# NotebookLM Reference

## Notebook

**Title:** Apple MDM Configuration Profiles
**ID:** `d614f6db-63d3-4024-b264-e1f45ef787a2`

This notebook is permanent — do not delete it.

## Sources (as of 2026-03-25)

| Source | Branch/URL |
|--------|-----------|
| Apple Developer Docs | `https://developer.apple.com/documentation/devicemanagement` |
| GitHub — release branch | `https://github.com/apple/device-management/tree/release` |
| GitHub — seed_OS-26.4 | `https://github.com/apple/device-management/tree/seed_OS-26.4` |
| ProfileManifests (community, third-party apps) | `https://github.com/ProfileManifests/ProfileManifests` |

**Note:** Seed branches (`seed_OS-X.Y`) are added for each macOS in development and removed once that OS ships (content merges into `release`). Check for new branches before creating profiles for unreleased OS versions — see the maintenance workflow in `SKILL.md`.

## Querying the Notebook

```bash
source ~/work/notebooklm-py/.venv/bin/activate
notebooklm use d614f6db-63d3-4024-b264-e1f45ef787a2
notebooklm ask "your question here"
```

Or specify the notebook directly:
```bash
notebooklm ask "your question" -n d614f6db-63d3-4024-b264-e1f45ef787a2
```

## Example Queries

- *"What keys are available for `com.apple.applicationaccess` on macOS 26?"*
- *"Is `enforcedSoftwareUpdateMajorOSDeferredInstallDelay` supported on macOS 26.3 and is it deprecated?"*
- *"What PayloadType and keys do I need to approve a system extension with bundle ID X and team ID Y?"*
- *"What TCC services are available in `com.apple.TCC.configuration-profile-policy` and what are the allowed values?"*
- *"Are there any new payload types in macOS 26.4 that weren't in 26.3?"*

## Managing Sources via CLI

```bash
# List current sources
notebooklm source list -n d614f6db-63d3-4024-b264-e1f45ef787a2

# Add a new branch
notebooklm source add "https://github.com/apple/device-management/tree/<branch>" -n d614f6db-63d3-4024-b264-e1f45ef787a2
```
