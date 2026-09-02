# Insure Club 18

Insure Club 18 is a responsive insurance advisor CRM for managing customers, policies, renewals, prospects, meetings, and messaging workflows in one place.

## Features implemented

- **Authentication**: admin login to secure core pages.
- **Customer management**: create, search, filter, edit, delete customers.
- **Family members**: add up to 5 family members per customer with DOB/anniversary and optional policy link.
- **Policy management**: upload policy files, set policy type/status, and link multiple policies to customers.
- **Renewal automation**: reminder scheduling at **15 / 7 / 2** days before due date for SMS + WhatsApp; reminders skip renewed/expired/cancelled policies.
- **Birthday & anniversary messaging**: template-driven personalized SMS/WhatsApp dispatch.
- **Prospect pipeline**: status tracking for calling updates, appointment status, meeting status, final meeting status, call closed, call denied; notes, attempts, follow-up date.
- **Prospect CSV import/export** and **customer CSV export**.
- **Meeting tracker + calendar**: create/edit meetings linked to customer/prospect and view in calendar + upcoming/past lists.
- **Festival/broadcast messaging**: send festival templates to customers, prospects, or both.
- **Dashboard**: renewals, birthdays, anniversaries, follow-ups, meetings, recent activity and message logs.
- **History/audit**: status changes, reminders sent, message dispatches, policy uploads, meeting updates logged.

## Tech stack

- Node.js + Express + EJS
- SQLite database (`data/insure-club-18.sqlite`)
- Multer for policy file upload
- node-cron for daily scheduler

## Quick start

```bash
npm install
npm start
```

Open: `http://localhost:3000`

Default credentials:

- Username: `admin`
- Password: `admin123`

> Change credentials in the database for production usage.

## Automation

A daily scheduler runs at **08:00** server time for:

- renewal reminders (15/7/2 day windows)
- birthday/anniversary messages

You can also trigger manually from dashboard using **Run Automation Now**.

## CSV formats

### Prospect import CSV columns

- `full_name` (required)
- `phone`
- `email`
- `status`
- `pipeline_stage`
- `attempts`
- `follow_up_date` (YYYY-MM-DD)
- `notes`

## File uploads

Policy attachments are stored in `/uploads` and served at `/uploads/<filename>`.

## Notes

- Messaging uses an abstraction layer with simulated dispatch and full logs so real SMS/WhatsApp providers can be connected later.
- Demo seed records are created on first launch.
