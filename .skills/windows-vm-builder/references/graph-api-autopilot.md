# Microsoft Graph API: Autopilot Device Registration

## When to Use This

Pre-registration via Graph API is the **alternative** strategy. The primary strategy (User-Driven OOBE without pre-registration) does not require this API. Use this when:
- You want fully zero-touch enrollment (no user interaction at OOBE)
- You need devices assigned to specific Autopilot profiles before first boot
- You want group tags for dynamic Entra group assignment

## App Registration Setup

### Create the App Registration in Entra ID

1. Go to Entra ID → App registrations → New registration
2. Name: `Autopilot-Device-Registration` (or similar)
3. Supported account types: Single tenant
4. No redirect URI needed

### Required API Permissions

| Permission | Type | Purpose |
|-----------|------|---------|
| `DeviceManagementServiceConfig.ReadWrite.All` | Application | Import and manage Autopilot devices |

Grant admin consent after adding the permission.

### Client Secret

1. Go to Certificates & secrets → New client secret
2. Set expiration per your security policy
3. Copy the secret value immediately (shown only once)

### Environment Variables

```bash
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
```

## API Endpoints

### Import a Device

```
POST https://graph.microsoft.com/beta/deviceManagement/importedWindowsAutopilotDeviceIdentities
```

**Request body:**
```json
{
  "serialNumber": "VM-SERIAL-NUMBER",
  "hardwareIdentifier": "BASE64-ENCODED-HARDWARE-HASH",
  "groupTag": "VirtualMachines"
}
```

**Response:** Returns an import object with an `id` for status polling.

### Check Import Status

```
GET https://graph.microsoft.com/beta/deviceManagement/importedWindowsAutopilotDeviceIdentities/{id}
```

**Status values:**
| Status | Meaning |
|--------|---------|
| `unknown` | Import queued |
| `pending` | Being processed |
| `complete` | Successfully registered |
| `error` | Registration failed |

### List Autopilot Devices

```
GET https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeviceIdentities
```

### Delete a Device (for decommissioning)

```
DELETE https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeviceIdentities/{id}
```

## Group Tags

Group tags enable dynamic Entra ID group membership for Autopilot devices:

1. Set `groupTag` when importing the device (e.g., `"VirtualMachines"`)
2. Create a dynamic group in Entra ID with rule:
   ```
   (device.devicePhysicalIds -any (_ -contains "[OrderID]:VirtualMachines"))
   ```
3. Assign Autopilot profiles and Intune policies to this group

## Python Script Usage

```bash
# Register a device
python3.12 scripts/register-autopilot.py --input hwid.json --group-tag "VirtualMachines"

# Dry run (no API call)
python3.12 scripts/register-autopilot.py --input hwid.json --dry-run
```

## Rate Limits

The Graph API has throttling limits. For bulk imports:
- Maximum 1000 devices per import batch
- Use the batch import endpoint for multiple devices
- Implement exponential backoff on 429 responses
