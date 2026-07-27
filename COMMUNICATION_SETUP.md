# DBS Kaduna communication setup

## 1. Apply the Supabase migration

Run `supabase/migrations/20260727_013_secure_communications.sql` against the same Supabase project used by the application. It creates the communication tables, security-definer permission checks, RLS policies, private `communication-recordings` bucket policies, and Realtime publication entries.

Confirm Realtime replication is enabled for `calls`, `meeting_participants`, and `recorded_messages` in Supabase. No service-role key belongs in the browser.

## 2. Environment values

The frontend uses the existing public values only:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

These must be set in Vercel for Preview and Production. Do not add `SUPABASE_SERVICE_ROLE_KEY`, storage secrets, or Jitsi moderation credentials to `VITE_` variables.

## 3. Jitsi Meet

The initial implementation uses the free hosted service at `https://meet.jit.si` inside an iframe. No Jitsi API key is required. Every room uses a fresh UUID-based `dbs-...` name and is not based on a name, email, or registration number.

For safeguarding-sensitive production use, move to a self-hosted or managed Jitsi deployment with authenticated room creation and moderation, then make its base URL a server-side configuration value. The frontend feature is isolated in `src/communication/CommunicationHub.jsx`, so a Twilio, Daily, or Agora adapter can replace the room component without changing the dashboard permission model.

## 4. Local verification

1. Start the Vite application and sign in as an administrator, an assigned instructor, and their student in separate browser sessions.
2. Confirm the administrator can reach both users; the instructor can see only assigned students; and the student sees only the assigned instructor plus DBS support.
3. Start, accept, reject, cancel, and end an audio/video call. Check the associated `calls` record and duration.
4. Schedule, join, and cancel a meeting. Confirm invitations remain visible after the participant reconnects.
5. Deny microphone/camera permission and check the friendly permission message. Turn the connection off, record a message, reconnect, and confirm it uploads from IndexedDB.
6. Use the Supabase policy tester with student/instructor/admin JWTs to verify direct access cannot expose unrelated calls, meetings, messages, or storage objects.

## 5. Vercel deployment

Apply the migration first, then deploy the existing Vite application normally. Add the two public Supabase values to the Vercel project, redeploy, and test both the deployed domain and the HTTPS camera/microphone prompts. Modern browsers require HTTPS for media access.

## Security and privacy assumptions

- Browser `tel:` and `sms:` links use the recipient phone only after the communication permission function authorizes that relationship.
- Live Jitsi rooms are not recorded by DBS Kaduna; the interface tells users when they leave DBS for Jitsi.
- A user must explicitly press Record and grant browser permission. Audio/video messages are private storage objects and are played through short-lived signed URLs.
- IndexedDB is a device-local temporary queue. It is not a replacement for encrypted mobile-device management.
- The hosted free Jitsi service is an external processor. Obtain the appropriate safeguarding approval and privacy notice before enabling calls for minors.

## Requires additional infrastructure or a paid service

- Authenticated Jitsi moderation, waiting rooms, audit-grade room access, and enterprise support.
- SMS sending (the current control only opens the device SMS application).
- PSTN/telephone calling (the current control only opens the device dialler).
- Push notifications, email/SMS meeting reminders, background upload reliability, and reliable missed-call delivery while the browser is closed.
- Content moderation, retention workflows, legal holds, and a safeguarding incident response service.
