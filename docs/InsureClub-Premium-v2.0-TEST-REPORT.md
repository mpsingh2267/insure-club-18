# InsureClub Premium CRM 2.0 — Verification Report

## Package verification

- JavaScript syntax: passed with `node --check`.
- Java source compilation: passed against Android API 35.
- DEX compilation: passed with minimum API 26.
- APK archive integrity: passed with no compressed-data errors.
- Package metadata: `com.insureclub.crm`, version code 2, version 2.0.0, min API 26, target API 35.
- APK signature: verified with schemes v2 and v3.
- Upgrade compatibility: signer certificate SHA-256 matches version 1.0 exactly (`48d84baa7d16cb343f63e05472067b7be88264d48e0860db4678b01c7d088b13`).
- Emulator upgrade: version 1.0 installed successfully, version 2.0 then installed with `adb install -r`, and version 2.0 launched successfully without uninstalling version 1.0.

## Browser-side workflow verification

The bundled CRM UI was served locally and exercised through a browser using disposable QA records. The shipped APK itself still starts without hypothetical customer data on a new installation.

- Created a customer and confirmed its birthday reminder appeared.
- Added two family members and confirmed family details/ages rendered.
- Created a policy with company, product, category, policy number, premium, sum insured, and renewal date.
- Verified partial search separately for company (`HDFC`), product (`Optima`), and category (`Health`), including match reasons.
- Created a porting reminder with target company/product.
- Created a sales appointment and confirmed it persisted in the customer profile.
- Generated personalized birthday and policy-renewal messages from editable templates.
- Verified monthly, quarterly, and yearly booked premium totals and the contributing-policy drill-down.
- Renewed the test policy, confirmed the old policy appeared in Policy History, and confirmed the renewed policy became Active.
- Reloaded the app and confirmed the reminder count remained 11 before and after reload, demonstrating deterministic reminder de-duplication.

## Native implementation verification

- Automatic backup is invoked after saved changes and again from the Android activity `onPause` lifecycle.
- Backup replacement uses a temporary file, filesystem synchronization, and atomic move.
- Portable backup validation requires the InsureClub format marker, supported version, schema version, and required data collections.
- Policy documents are checked for the `%PDF-` header before being copied into managed storage.
- Export embeds managed policy documents; restore/import reinstalls them by policy ID.
- Import presents backup date and customer/policy/family counts before replace or stable-ID merge.
- Emulator lifecycle test: sending the app to the background produced `files/backups/latest.icbackup` with reason `app-backgrounded` and the expected format/schema markers.
- Emulator export test: Android's save picker created a complete 1,998-byte `.icbackup.json` file whose payload began with the `INSURECLUB_BACKUP` marker and `manual-export` reason.
- Emulator import test: the exported file reopened successfully, displayed its backup timestamp and record counts, offered **Replace** and **Merge safely**, and completed the safe-merge path without an Android runtime crash.

External PDF viewers and WhatsApp depend on apps installed on the destination phone. Those external-app handoffs should be checked once on the intended physical device.
