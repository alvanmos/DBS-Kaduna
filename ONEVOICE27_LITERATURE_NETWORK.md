# OneVoice27 Literature Network

## DBS assessment

DBS Kaduna is a React 19/Vite application deployed with Vercel. It uses Supabase Auth and the `profiles` table for identities, Supabase Row Level Security for protected data, SQL migrations in `supabase/migrations`, and Vercel server endpoints for privileged registration and Resend email delivery. Existing roles are admin, student and instructor; the module extends—not replaces—them with donor, evangelist and coordinator roles.

The first implementation modifies the application router (`src/main.jsx`), adds the Literature Network feature files under `src/literature/`, extends the email worker (`api/notifications/process.js`), and adds the migration `20260910_027_onevoice27_literature_network.sql`.

## Core model

- `literature_catalogue` contains administrator-managed titles and extensible metadata.
- `literature_sources` represents individual donors, churches, ministries, institutions, and organisations. Private addresses are stored separately from general location.
- `literature_inventory` stores on-hand, reserved, and distributed quantities; `literature_inventory_transactions` is the append-only stock ledger.
- `literature_requests` stores the secure workflow and nullable DBS student link. `literature_request_status_history`, confirmations, problem reports and audit logs provide traceability.

## Safety assumptions

- Apply the migration to the same Supabase project before deploying the feature. It is required before requests, reservations, dashboards, or queued emails are enabled.
- Only active, approved evangelists can search or create requests. The search function never returns a donor's private address, email, or WhatsApp number.
- The first inventory reservation is made inside a locked database transaction. Delivery completion atomically converts reservation into distribution.
- Existing DBS email delivery is reused. The daily worker queues a reminder only once per request-week.
- Geocoding is optional. Latitude/longitude may be entered through a future provider-backed admin workflow; no commercial key is stored in the browser.

## Operational workflow

1. A donor or church registers at `/literature/register-donor` and receives a secure Supabase invitation. Plaintext passwords are never stored or emailed.
2. An administrator creates or approves an evangelist and changes `literature_evangelists.account_status` to `active`.
3. An active evangelist searches the privacy-safe database function, creates a request, and reserves stock in the same locked transaction.
4. The source accepts, declines, marks ready, or records in-transit handling. Cancellation and decline release the reservation.
5. Evangelist delivery confirmation moves reserved stock to distributed stock and records confirmation, status history, and audit history.

## Deployment

1. Apply `supabase/migrations/20260910_027_onevoice27_literature_network.sql` with the same migration mechanism used for DBS. Do this before releasing the web code.
2. Retain the existing Supabase and Resend variables. The optional `ONEVOICE27_GEOCODING_*` values are server-only and are not required for list-based location search.
3. Deploy the Vercel application. The existing daily notification worker also queues seven-day pending-request reminders.
4. Create administrator-approved evangelist and coordinator records through the database administration process before granting access. The public registration endpoint creates donor accounts only.

## First-release constraints

The module supports list-based location search immediately. Map rendering, third-party geocoding, cover-image upload, report exports, and a DBS-student “Send Literature” action are deliberately extension points: they require provider configuration or a separately designed administrative workflow and are not exposed as unsecured placeholders.
