# Payload Types Reference

For full key listings per PayloadType, query the NotebookLM notebook (see `notebooklm.md`).

## Apple-Native Payload Types

These use Apple's built-in `com.apple.*` types. Keys are defined by Apple and documented in the Device Management schema.

| PayloadType | Purpose |
|-------------|---------|
| `com.apple.applicationaccess` | Restrictions — enforce/defer software updates, disable features |
| `com.apple.ManagedClient.preferences` | Managed preferences for system domains |
| `com.apple.syspolicy.kernel-extension-policy` | Allow/block kernel extensions (kexts) by team ID |
| `com.apple.system-extension-policy` | Allow/block system extensions by bundle ID and team ID |
| `com.apple.TCC.configuration-profile-policy` | Privacy/TCC — grant apps access to protected resources (Full Disk, Accessibility, etc.) |
| `com.apple.notificationsettings` | Manage notification permissions per app |
| `com.apple.webcontent-filter` | Web content filtering rules |
| `com.apple.security.firewall` | macOS Application Firewall settings |
| `com.apple.security.FDERecoveryKeyEscrow` | FileVault recovery key escrow |
| `com.apple.MCX` | Legacy managed preferences |
| `com.apple.wifi.managed` | Wi-Fi network configuration |
| `com.apple.vpn.managed` | VPN configuration |
| `com.apple.certificate-preference` | Certificate trust settings |
| `com.apple.screensaver` | Screensaver policy |
| `com.apple.loginwindow` | Login window behaviour |
| `com.apple.dock` | Dock configuration |
| `com.apple.finder` | Finder preferences |
| `com.apple.SoftwareUpdate` | Software update settings |
| `com.apple.SetupAssistant.managed` | Skip Setup Assistant screens |
| `com.apple.security.smartcard` | Smart card enforcement |
| `com.apple.servicemanagement` | Control which services/daemons can run (replaces kext approvals for modern tools) |

## Finding Third-Party Payload Types

Third-party apps use their bundle ID as the `PayloadType`. Use these methods in order of convenience:

### 1. Check the table below
Common apps are listed — check here first.

### 2. iTunes Search API (no app required, works in any browser)
```
https://itunes.apple.com/search?term=<app+name>&entity=macSoftware&limit=5
```
Returns JSON — look for the `bundleId` field. Example for Figma:
```
https://itunes.apple.com/search?term=figma&entity=macSoftware&limit=5
```
Note: Only works for App Store apps. For non-App Store apps, use method 3 or 4.

### 3. ProfileManifests GitHub (no app required)
Search `https://github.com/ProfileManifests/ProfileManifests` by app name — manifest files are named by bundle ID (e.g., `com.google.Chrome.yaml`). Also queryable via the NotebookLM notebook.

### 4. NotebookLM query (no app required)
Ask the notebook: *"What is the bundle ID for \<App Name\>?"* — ProfileManifests is indexed as a source.

### 5. Local lookup (app must be installed)
```bash
mdls -name kMDItemCFBundleIdentifier /Applications/App.app
```

---

### Common App Bundle IDs

| App | PayloadType (Bundle ID) |
|-----|-------------------------|
| Google Chrome | `com.google.Chrome` |
| Mozilla Firefox | `org.mozilla.firefox` |
| Zoom | `us.zoom.config` |
| 1Password 7 | `com.agilebits.onepassword7` |
| 1Password 8 | `com.1password.1password` |
| Slack | `com.tinyspeck.slackmacgap` |
| VS Code | `com.microsoft.VSCode` |
| Cursor | `com.todesktop.230313mzl4w4u92` |
| Figma | `com.figma.Desktop` |
| Notion | `notion.id` |
| Docker Desktop | `com.docker.docker` |
| Microsoft Teams | `com.microsoft.teams2` |
| Microsoft Office (Word) | `com.microsoft.Word` |
| Microsoft Office (Excel) | `com.microsoft.Excel` |
| Microsoft Office (Outlook) | `com.microsoft.Outlook` |
| Okta Verify | `com.okta.mobile.auth-service-extension` |
| Cloudflare WARP | `com.cloudflare.1dot1dot1dot1.macos` |
| SentinelOne | `com.sentinelone.SentinelAgent` |
| Santa | `com.northpolesec.santa` |
| Nudge | `com.github.macadmins.Nudge` |
| Google Drive | `com.google.drivefs` |
| Dropbox | `com.dropbox.client2` |
| Canva | `com.canva.CanvaDesktop` |

For apps that publish their MDM schema, check their developer documentation or query the NotebookLM notebook.

## Kandji-Specific Types

| PayloadType | Purpose |
|-------------|---------|
| `io.kandji.globalvariables` | Expose Kandji template variables to other profiles |
| `com.github.macadmins.Nudge` | Nudge macOS update nudging tool configuration |
