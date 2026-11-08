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
│   ├── InsureClub-Premium-v2.2-README.md
│   ├── InsureClub-Premium-v2.3-README.md
│   └── SHA256SUMS.txt
│
├── releases/             # Pre-built signed APKs (v1.0, v2.0, v2.1, v2.2, v2.3)
│   ├── InsureClub-Premium-v1.0.apk
│   ├── InsureClub-Premium-v2.0.apk
│   ├── InsureClub-Premium-v2.1.apk
│   ├── InsureClub-Premium-v2.2.apk
│   └── InsureClub-Premium-v2.3.apk
│
├── supabase/             # Supabase cloud database schema & migrations
│   └── schema.sql        # Database tables, indexes, and RLS policies
├── site/                 # Netlify Web Portal (Supabase Cloud Database Console)
│   ├── index.html        # Single-page console application
│   ├── styles.css        # Responsive portal styles
│   ├── app.js            # Supabase REST & Realtime WebSocket client
│   └── _redirects        # Netlify SPA route redirect configuration
│
├── netlify.toml          # Netlify build and deployment configuration
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

---

## 3. Netlify Cloud Database Portal (`site/`)

A live, high-speed single-page web console designed to run on Netlify edge hosting to access and manage the Supabase cloud database directly from any browser or desktop.

### Features
- **Cloud Database Dashboard**: Real-time KPI counters (active policies, preserved historical policies, annual premium ₹, sum insured ₹, document vault).
- **Customer & Policy Management**: Create, edit, and search client records and policies in Supabase.
- **Policy Term Preservation**: When renewing a policy on the web, older policy terms are preserved as `Renewed` and new terms are created with zero data deletion.
- **Document Metadata Registry**: Track attached PAN cards, birth certificates, Aadhaar cards, and policy schedules.
- **Raw SQL / Table Explorer**: Direct interactive inspector for all 6 database tables (`customers`, `policies`, `family_members`, `appointments`, `reminders`, `documents`) with JSON and CSV exports.
- **Pre-Configured**: Out of the box pre-connected to Supabase cloud database with configurable connection settings.

### Deploy to Netlify
1. Connect this repository (`mpsingh2267/insure-club-18`) to Netlify via the [Netlify Dashboard](https://app.netlify.com/).
2. Netlify will automatically detect [`netlify.toml`](./netlify.toml) with `publish = "site"`.
3. Click **Deploy Site** — it builds and deploys in seconds!

---

## 4. Supabase Cloud (`supabase/`)

All three apps sync with the Supabase project **insure-club-18** (`https://pzezoumopzwczakpsdlk.supabase.co`). The project URL and public key are built in, so nothing needs to be typed in.

### Access control
Customer data never opens to the public key alone. The tables in [`supabase/schema.sql`](./supabase/schema.sql) only allow **signed-in advisors whose confirmed email is listed in `public.crm_members`**.

Add an advisor:
1. Supabase dashboard → **Authentication → Users → Add user** (email + password, *Auto Confirm User* on).
2. Supabase dashboard → **SQL Editor**:
   ```sql
   INSERT INTO public.crm_members (email) VALUES ('advisor@example.com');
   ```

### Signing in
- **Android app & Netlify portal**: open **Settings** and sign in with the advisor email and password. Offline changes stay in the local outbox and sync after sign-in.
- **Web CRM (`web/`)**: run `npm run connect-supabase` once. It asks for the advisor login (the password is hidden), checks it, and saves it to `web/.env` (git-ignored). Alternatively set `SUPABASE_SERVICE_ROLE_KEY` in `web/.env`.

Shared sign-in code lives in `site/supabase-auth.js` (a copy ships in `android/app/src/main/assets/`).
