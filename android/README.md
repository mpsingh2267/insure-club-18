# InsureClub Premium CRM 2.0

InsureClub 2.0 is a local-first Android insurance CRM. It upgrades version 1.0 in place and migrates the original customer, policy, appointment, and advisor records into the connected v2 data model.

## Install or upgrade

1. Copy `InsureClub-Premium-v2.0.apk` to an Android phone running Android 8.0 or newer.
2. Open the APK and allow installation from that source if Android asks.
3. If InsureClub 1.0 is already installed, install 2.0 over it. Both APKs use the same signing certificate, so existing app data can be retained.
4. Launch InsureClub, select **Enable reminders**, and allow notifications.

Do not uninstall version 1.0 before upgrading if it contains real data. Uninstalling or clearing app storage removes local records.

## CRM capabilities

- Customer profiles with Overview, Family, Policies, Policy History, Appointments, Reminders, Documents, and Activity History.
- Unlimited family members with DOB-based birthday reminders.
- Active policies with company, product, category, premium, renewal, sum insured, and PDF document storage.
- Non-destructive policy renewal: the prior policy moves to history and the renewed policy stays active.
- Policy porting reminders and status tracking.
- Sales appointments, follow-up scheduling, and native reminders.
- Editable message templates with customer, family, policy, premium, renewal, appointment, and advisor variables.
- Advanced partial search across customers, mobiles, family members, policy numbers, companies, products, and categories.
- Monthly, quarterly, and yearly booked-premium totals with contributing-policy drill-down.
- Reminder Centre with Today, Tomorrow, This Week, Overdue, renewal, birthday, appointment, porting, and completed views.
- Call, message, appointment, snooze, complete, and open-customer actions.

## Automatic backup

Every saved change is immediately written to the app database and mirrored to an atomic native backup. Another backup is requested whenever the app moves to the background or closes normally. A temporary file is fully written and synchronized before it replaces the last known-good backup.

Settings → **Backup & Restore** provides:

- Create backup now
- Export complete data
- Import complete data
- Restore latest automatic backup
- Last backup date and time

Portable `.icbackup` files contain the complete CRM state and embedded policy PDFs. Import validates the file type, format version, required data collections, backup date, record counts, and PDF headers before offering **Replace** or **Merge safely**. Merge uses stable record IDs rather than customer names.

## Policy PDFs

PDFs are copied into app-managed storage and remain linked by policy ID. The policy screen supports add, view, replace, download, share, and delete. Downloads use a customer/company/product/policy-number filename.

## WhatsApp

InsureClub resolves the selected editable template, inserts real customer and policy information, then opens the matching WhatsApp conversation. You review the message and press **Send** yourself; the app never silently sends a message.

## Build information

- Package: `com.insureclub.crm`
- Version: `2.0.0` (`versionCode 2`)
- Minimum Android: 8.0 / API 26
- Target Android: API 35
- Signature: same Android debug certificate as InsureClub 1.0, APK Signature Scheme v2/v3

This build is suitable for direct installation and internal use. Google Play publication requires a permanent release signing key and an Android App Bundle.
