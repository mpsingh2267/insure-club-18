# InsureClub Suite — CRM & Entry Management System

InsureClub is an end-to-end insurance CRM and entry management suite built for insurance advisors to manage customer profiles, policies, prospect pipelines, renewals, family members, document storage, and scheduled communications.

---

## Repository Structure

```
├── web/                  # Web CRM & Entry Management System (Node.js/Express/SQLite)
│   ├── src/              # Backend services (auth, db, automation, csv, messaging)
│   ├── views/            # Entry forms & views (customer, policy, prospect, meeting)
│   ├── public/           # Stylesheets and static assets
│   ├── test/             # Smoke and integration test suites
│   ├── index.js          # Entrypoint server script
│   └── package.json      # Dependencies and scripts
│
├── android/              # InsureClub Premium Android CRM (Hybrid Java + Local-First Web)
│   ├── app/              # Android application module
│   │   ├── src/main/     # Java native bridge, assets (offline UI), manifest, and resources
│   │   └── build.gradle.kts
│   └── README.md
│
├── docs/                 # Verification reports, upgrade guides, and checksums
│   ├── InsureClub-Premium-v2.0-README.md
│   ├── InsureClub-Premium-v2.0-TEST-REPORT.md
│   └── SHA256SUMS.txt
│
├── releases/             # Pre-built signed APKs (v1.0, v2.0, v2.1)
│   ├── InsureClub-Premium-v1.0.apk
│   ├── InsureClub-Premium-v2.0.apk
│   └── InsureClub-Premium-v2.1.apk
│
└── assets/               # Branding assets, UI screenshots, and diagrams
```

---

## 1. Web CRM & Entry Management System (`web/`)

A responsive insurance advisor CRM for managing customers, policies, renewals, prospects, meetings, and messaging workflows.

### Key Capabilities
- **Customer Entry & Management**: Complete profile management with DOB, contact details, address, and anniversary tracking.
- **Family Member Linking**: Attach up to 5 family members per customer with birthdays and policy associations.
- **Policy Management**: Entry of policy numbers, premium amounts, sum insured, renewal dates, and PDF attachments.
- **Automated Renewals**: Daily background scheduler alerting at **15 / 7 / 2** days before due dates via SMS and WhatsApp.
- **Prospect Pipeline**: Track leads across statuses (New, Appointment, Meeting, Closed, Denied).
- **Import / Export**: CSV import and export for rapid data entry and migration.

### Quick Start (Web)
```bash
cd web
npm ci
npm start
```
Access at `http://localhost:3000` (Default credentials: `admin` / `admin123`).

---

## 2. InsureClub Premium Android (`android/`)

A local-first Android CRM with atomic native backups, PDF document isolation, and scheduled local notifications.

### Android Features
- **Offline First**: All customer and policy records stored locally without external telemetry.
- **Automatic Native Backup**: Instant mirror to atomic native `.icbackup` on every edit or when app is backgrounded.
- **PDF Document Provider**: Direct policy document viewer and sharing.
- **Direct WhatsApp Messaging**: Prepares templated WhatsApp messages with dynamic customer/policy variables.

### Build (Android)
Requires Android SDK API 35 (minimum API 26):
```bash
cd android
./gradlew assembleRelease
```
Pre-built APKs are available in the [`releases/`](./releases/) directory.
