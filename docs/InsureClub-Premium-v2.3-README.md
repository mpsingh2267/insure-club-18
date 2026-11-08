# InsureClub Premium CRM 2.3 — Release Notes & Verification

InsureClub Premium v2.3 introduces enhanced Supabase cloud sync intelligence (with graceful placeholder detection, offline safety, and 1-click SQL schema copying), universal document attachments (PAN cards, birth certificates, Aadhaar cards, policies), policy renewal preservation, and high-priority heads-up popup notifications on Android.

---

## What's New in v2.3

### 1. Dual-Mode Supabase Engine & Diagnostic Clarity
- **Offline Sandbox Safety**: Detects placeholder endpoints and operates in silent, reliable Local Sandbox Mode without network errors or DNS lookups.
- **1-Click SQL Schema Copy**: Added direct button in Settings to copy the complete `schema.sql` (6 tables, indexes, RLS policies) to your clipboard for instant setup in the Supabase SQL Editor.
- **Connection Diagnostics**: When testing connection, provides clear latency readout or actionable guidance if the placeholder URL is used.
- **Shared Cloud Sync**: When live Supabase credentials are provided, both the Android app and the Netlify website stay synchronized in real time.

### 2. Universal Local Document Attachments (PAN Card, Birth Certificate, etc.)
- **Multi-Document Support**: Attach any document type to a customer, specific policy, or family member:
  - 🪪 **PAN Card**
  - 📜 **Birth Certificate**
  - 🪪 **Aadhaar Card**
  - 📄 **Policy Schedules & Documents**
  - 📝 **Proposal Forms**
  - 🧾 **Premium Receipts**
  - 🚗 **Driving License / Voter ID / Passport**
  - 🏥 **Medical Examination Reports**
- **Format Flexibility**: Accepts both PDF documents and images (JPG, PNG, WEBP).
- **Local Storage Vault**: Binaries stay 100% locally on device hardware (`/storage/emulated/0/InsureClub/documents/`). Only metadata is synchronized with Supabase.

### 3. Policy Preservation (Never Delete Older Policies)
- **Zero Data Loss on Renewal**: Renewing a policy updates the existing policy record to status `Renewed`, preserving its start date, original renewal date, notes, and all attached documents.
- **Brand New Policy Record**: A new policy record is created for the renewed term (`status: 'Active'`) linked via `previousPolicyId`.

### 4. High-Priority Heads-Up Popup Notifications on Android
- **Android Popup Banner / Heads-Up Delivery**:
  - Dedicated high-priority notification channel (`insureclub_alerts_v3`).
  - Vibration pattern (`[0, 300, 200, 300]`), system notification sound, and lockscreen public visibility.
  - Set `Notification.PRIORITY_MAX` and `Notification.DEFAULT_ALL` to ensure notifications pop up as interactive banners on the screen.
- **Exact Alarms & Doze Mode Wake-up**:
  - Permissions: `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `VIBRATE`, and `WAKE_LOCK`.
  - Configured `setExactAndAllowWhileIdle` to fire reliably even when the screen is off or the phone is in low-power idle mode.

---

## Build Verification

```bash
# Package metadata
Package: com.insureclub.crm
Version Code: 5
Version Name: 2.3.0
Target SDK: 35
Min SDK: 26

# SHA-256 Checksum
d17e22ed5ea1dc7e6df1047ba2bc62cf272d65a2887c28f3f5228f0cfe26de33  releases/InsureClub-Premium-v2.3.apk
```

Verification status:
- All unit and integration test suites passed.
- APK signature verified with schemes v2 and v3.
- All attached files verified to store locally on device.
