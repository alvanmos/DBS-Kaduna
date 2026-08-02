# Zoom integration setup

## 1. Apply the database migration

Apply `supabase/migrations/20260731_014_zoom_classes.sql` to the DBS Kaduna Supabase project before deploying. It creates the Zoom account, class, attendee, webhook, error, and audit tables; enables RLS; and removes the retired browser-embedded meeting tables.

## 2. Create the Zoom Marketplace app

Create a **User-managed OAuth** app in the Zoom Marketplace. Add the production and preview domains to the allow list, and request the minimum meeting scopes needed to create, update, delete, and read the instructor's meetings (for example `meeting:write:meeting`, `meeting:read:meeting`, and `user:read:user`). Each volunteer instructor authorizes their own account; DBS administrators never receive a Zoom password or unencrypted token.

Register this redirect URL exactly:

```text
https://YOUR_DOMAIN/api/zoom/callback
```

For local Vercel development, register the matching HTTPS tunnel/development URL supplied by Vercel, then set `ZOOM_REDIRECT_URI` to that exact URL. Zoom does not accept an unregistered redirect URL.

## 3. Environment variables

Set the Supabase service key and these server-only values in Vercel (Preview and Production):

```text
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=
ZOOM_WEBHOOK_SECRET_TOKEN=
ZOOM_TOKEN_ENCRYPTION_KEY=
NEXT_PUBLIC_APP_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Generate `ZOOM_TOKEN_ENCRYPTION_KEY` as 32 random bytes, encoded as base64 or 64 hexadecimal characters. Do not use a `VITE_` prefix for any Zoom or service-role secret. The browser needs only the existing public Supabase URL and publishable key.

## 4. Configure Zoom webhooks

In the same Marketplace app, subscribe to:

- `meeting.started`
- `meeting.ended`
- `meeting.updated`
- `meeting.deleted`
- `meeting.participant_joined`
- `meeting.participant_left`

Set the event notification endpoint to:

```text
https://YOUR_DOMAIN/api/zoom/webhook
```

Zoom validates the endpoint with `endpoint.url_validation`. Subsequent webhook requests are verified using the Zoom signature and timestamp before they are stored. Duplicate event IDs are rejected by a database uniqueness constraint. Participants are matched to assigned students by their registered email; unmatched participants are retained for an administrator's secure review.

## 5. Test checklist

1. Run `vercel dev` (rather than the static Vite server) when testing OAuth or API routes locally.
2. Sign in as an approved instructor, connect Zoom, schedule a class, and choose one or more assigned students.
3. Confirm the student sees only their assigned Online Class and cannot request another class's join link.
4. Confirm **Join Class** appears only 15 minutes before the start time, returns the participant URL, and never returns a host URL.
5. Update/cancel the class as its owner and verify another instructor cannot do either action.
6. Use Zoom's webhook test tool to send signed lifecycle and participant events; check attendance, errors, and CSV export in administration.
7. Revoke Zoom authorization or let a token expire to verify the connection error and automatic refresh path.

The frontend contains no Zoom credentials, host/start URLs, OAuth tokens, API keys, or client secrets. These are encrypted or used only by Vercel server functions.
