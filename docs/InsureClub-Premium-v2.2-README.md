# InsureClub Premium CRM 2.2 — Release Notes & Verification

InsureClub Premium v2.2 introduces Supabase cloud database synchronization, universal local document attachment (PAN cards, birth certificates, Aadhaar cards, and policies), policy renewal preservation (guaranteeing that older policies are never deleted when renewed or when new policies are created), and high-priority heads-up popup notifications on Android.

---

## What's New in v2.2

### 1. Supabase Cloud Database & Multi-Device Sync
- **Cloud Database Integration**: Connect your Supabase project using standard REST API integration.
- **Local-First File Guarantee**: In accordance with privacy and storage rules, **attached files (policy PDFs, PAN cards, birth certificates, Aadhaar cards) remain stored 100% locally** in device private storage. Only database records and document metadata are synchronized with Supabase.
- **Two-Way Synchronization**:
  - **Push (Upload to Supabase)**: Safely upserts customers, policies, family members, appointments, reminders, and document metadata.
  - **Pull (Download from Supabase)**: Downloads remote records and merges them by unique ID into local storage.
  - **Auto-Sync Option**: Automatically synchronizes local changes to Supabase in the background when enabled.
- **SQL Schema Script**: Provided in [`supabase/schema.sql`](../supabase/schema.sql) with tables, indexes, and Row-Level Security (RLS) policies.

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
- **In-App Document Vault**: Customer profile "Documents" tab with type filtering, formatted file sizes, and instant actions:
  - **View**: Opens with native system viewer.
  - **Share**: Shares via WhatsApp or any installed sharing target.
  - **Download**: Exports to device storage.
  - **Delete**: Safely removes local file and metadata.
- **Safe Bundling**: Complete `.icbackup` automatic backups and exports bundle all local attached documents with MIME types and Base64 payloads.

### 3. Policy Preservation (Never Delete Older Policies)
- **Zero Data Loss on Renewal**: Renewing a policy updates the existing policy record to status `Renewed`, preserving its start date, original renewal date, notes, and all attached documents.
- **Brand New Policy Record**: A new policy record is created for the renewed term (`status: 'Active'`) linked via `previousPolicyId`.
- **Customer Profile Policy Filtering**:
  - **Active Policies**: Shows current policies with renewal countdowns.
  - **Renewed / Preserved**: Displays all previous term policies with `[Renewed]` badges and attached documents.
  - **All Policies**: Shows the complete protection history across all years.

### 4. High-Priority Heads-Up Popup Notifications on Android
- **Android Popup Banner / Heads-Up Delivery**:
  - Replaced legacy silent channel with dedicated high-priority channel (`insureclub_alerts_v3`).
  - Enabled vibration pattern (`[0, 300, 200, 300]`), system notification sound, and lockscreen public visibility.
  - Set `Notification.PRIORITY_MAX` and `Notification.DEFAULT_ALL` to ensure notifications pop up as interactive banners on the screen.
- **Exact Alarms & Doze Mode Wake-up**:
  - Added permissions: `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `VIBRATE`, and `WAKE_LOCK`.
  - Configured `setExactAndAllowWhileIdle` to fire reliably when the screen is off or the phone is in low-power idle mode.
- **Settings Screen Diagnostics**:
  - **Test Popup Notification**: Immediately triggers an instant popup notification banner with sound and vibration to test and verify delivery.
  - **Alarm & Exact Alert Settings**: Direct shortcut to Android system exact alarm permissions.
  - **Clear History & Resync**: Resets suppression state so notifications trigger cleanly.

---

## Build Verification

```bash
# Package metadata
Package: com.insureclub.crm
Version Code: 4
Version Name: 2.2.0
Target SDK: 35
Min SDK: 26

# SHA-256 Checksum
3e23630476423ff18fb985b41d97a943694d47ab86606138858ae9c403c3ed45  releases/InsureClub-Premium-v2.2.apk
```

Verification status:
- All unit and integration test suites passed.
- APK signature verified with schemes v2 and v3.
- All attached files verified to store locally on device.
