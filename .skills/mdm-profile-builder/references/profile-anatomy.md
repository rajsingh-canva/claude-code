# Profile Anatomy

## Two-Level Payload Structure

Every `.mobileconfig` is a plist XML with two levels:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- OUTER PAYLOAD (PayloadType = "Configuration") -->
  <key>PayloadContent</key>
  <array>
    <dict>
      <!-- INNER PAYLOAD (PayloadType = vendor bundle ID or Apple type) -->
      <!-- App-specific keys go here -->
    </dict>
  </array>

  <key>PayloadDisplayName</key>   <string>Human-Readable Profile Name</string>
  <key>PayloadDescription</key>   <string>One-line description of what this profile does</string>
  <key>PayloadIdentifier</key>    <string>com.yourorg.profile.custom.<UUID></string>
  <key>PayloadOrganization</key>  <string>Your Organization</string>
  <key>PayloadUUID</key>          <string><UUID></string>
  <key>PayloadVersion</key>       <integer>1</integer>
  <key>PayloadType</key>          <string>Configuration</string>
  <key>PayloadScope</key>         <string>System</string>
  <key>PayloadRemovalDisallowed</key> <true/>
  <key>TargetDeviceType</key>     <integer>5</integer>
</dict>
</plist>
```

### Required Outer Keys

| Key | Value |
|-----|-------|
| `PayloadContent` | `<array>` containing one or more inner payload `<dict>`s |
| `PayloadDisplayName` | Human-readable name shown in MDM UI |
| `PayloadDescription` | Short description of what the profile does |
| `PayloadIdentifier` | Reverse-domain + UUID (e.g., `com.yourorg.profile.custom.<UUID>`) |
| `PayloadOrganization` | Your organization name |
| `PayloadUUID` | Fresh UUID (generate with `uuidgen`) |
| `PayloadVersion` | Always `<integer>1</integer>` |
| `PayloadType` | Always `<string>Configuration</string>` |
| `PayloadScope` | `System` (device-wide) or `User` (per-user) |
| `PayloadRemovalDisallowed` | `<true/>` for security/compliance; `<false/>` for optional profiles |
| `TargetDeviceType` | `<integer>5</integer>` for macOS |

### Required Inner Payload Keys

| Key | Value |
|-----|-------|
| `PayloadDisplayName` | Human-readable name for this payload |
| `PayloadIdentifier` | Reverse-domain identifier (e.g., `com.google.Chrome.<UUID>`) |
| `PayloadType` | Vendor bundle ID or Apple type (e.g., `com.google.Chrome`) |
| `PayloadUUID` | Fresh UUID — different from the outer UUID |
| `PayloadVersion` | Always `<integer>1</integer>` |

---

## Naming Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| Directory | Title Case with spaces | `Disable Automatic Updates for Figma` |
| File | snake_case `.mobileconfig` | `disable_automatic_updates_figma.mobileconfig` |
| Outer `PayloadIdentifier` | `com.<vendor>.profile.custom.<UUID>` | `com.kandji.profile.custom.A1B2C3D4-...` |
| Inner `PayloadIdentifier` | `com.<vendor>.<app>.<UUID>` | `com.google.Chrome.8FC70816-...` |

For profiles with variants (e.g., regional or environment-specific), suffix the filename:
- `warp_global.mobileconfig`
- `warp_china.mobileconfig`
- `chrome_token_production.mobileconfig`

### DSM Repo (`/Users/rajsingh/work/dsm`) — Additional Conventions

Always read `/Users/rajsingh/work/dsm/CLAUDE.md` for the authoritative naming rules. Summary:

| Convention | Pattern | Example |
|------------|---------|---------|
| Branch | `username/JIRA-123-short-description` | `rajsingh/DSM-1234-santa-events-profile` |
| Commit message | One line only | `Add Santa events config profile` |
| Profile directory | Title Case, under `kandji/custom-profiles/` | `Santa Configuration - Events` |
| Profile filename | snake_case `.mobileconfig` | `santa_configuration_events.mobileconfig` |

---

## Kandji Variable Substitution

Kandji injects these variables at deploy time using `$VARIABLE_NAME` syntax:

| Variable | Description |
|----------|-------------|
| `$EMAIL` | Device owner's email address |
| `$EMAIL_PREFIX` | Part before `@` in the email |
| `$FULL_NAME` | Device owner's full name |
| `$DEVICE_NAME` | Device name |
| `$DEVICE_ID` | Kandji device ID |
| `$SERIAL_NUMBER` | Device serial number |
| `$UDID` | Device UDID |
| `$BLUEPRINT_ID` | Kandji Blueprint ID |
| `$BLUEPRINT_NAME` | Kandji Blueprint name |
| `$DEPARTMENT` | Department from directory |
| `$JOB_TITLE` | Job title from directory |
| `$ASSET_TAG` | Asset tag |
| `$PROFILE_UUID` | UUID of the deployed profile |

Use these anywhere a string value is expected in the inner payload.

---

## Complexity Spectrum

**Minimal** — single boolean or string setting (~1KB):
```xml
<key>AutoUpdate</key>
<false/>
```

**Medium** — multi-setting app configuration with nested structures (~3–10KB):
```xml
<key>SomePolicy</key>
<dict>
  <key>enabled</key>
  <true/>
  <key>mode</key>
  <string>enforce</string>
</dict>
```

**Complex** — embedded assets, HTML-escaped strings, template variables (~10–30KB):
```xml
<key>BrandingCompanyLogo</key>
<string>data:image/svg+xml;base64,PHN2Zy...</string>

<key>MessageBody</key>
<string>Visit &lt;a href=&quot;https://example.com&quot;&gt;here&lt;/a&gt; for help.</string>

<key>MachineOwner</key>
<string>$EMAIL</string>
```

---

## Multiple Inner Payloads

A single `.mobileconfig` can contain multiple inner payloads in the `PayloadContent` array — useful when configuring related settings that belong together (e.g., system extension + kernel extension policy for the same tool). Each inner payload must have its own unique UUID.
