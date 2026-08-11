# Design QA

- Source issue screenshot: `C:\Users\BTC\AppData\Local\Temp\codex-clipboard-549ef0de-51be-4501-8fce-731441101174.png`
- Source logo: `C:\Users\BTC\AppData\Local\Temp\codex-clipboard-9c6b5a39-cb6f-4331-b11f-9991c6f1f0f3.png`
- Repository logo assets: `public/dbs-kaduna-logo.png` and `public/voice-of-prophecy-logo.png`
- Implementation screenshot: `C:\Users\BTC\Documents\Website for DBS Kaduna\qa-home-desktop-final.png`
- Mobile screenshot: `C:\Users\BTC\Documents\Website for DBS Kaduna\qa-home-mobile-final.png`
- Before/after comparison: `C:\Users\BTC\Documents\Website for DBS Kaduna\qa-comparison.png`
- Desktop audit viewport: `1440 x 1200`
- Mobile audit viewport: `390 x 844`
- Focused state: Study Guide 16 selected as the central cover.

**Full-View Comparison Evidence**

The before/after comparison confirms that Guide 16's title was previously clipped
at the right edge. The corrected central cover preserves the source artwork's full
aspect ratio and shows the complete title, "The Secret of Heavenly Rest."

**All-Guide Audit**

Every guide from 1 through 26 was selected programmatically as the central cover
at both desktop and mobile sizes, for 52 checked states.

- All 26 source files loaded successfully in both viewports.
- Every selected cover used `object-fit: contain`.
- Every selected cover preserved its natural aspect ratio without cropping.
- Every guide number and counter matched the selected source file.
- No horizontal page overflow was found.
- No browser runtime errors were reported.

**Logo Verification**

- The header loads `dbs-kaduna-logo.png` directly from the repository.
- The header loads `voice-of-prophecy-logo.png` directly from the repository.
- Both logos use `object-fit: contain` and retain their natural proportions.
- The Voice of Prophecy asset has no dot; a cache-busting file URL ensures older
  browser-cached logo artwork is not reused.

**Responsive Finding**

On a phone, the tall central cover extends below the first viewport and is reached
by normal page scrolling. The cover itself is complete and uncropped; the verified
scrolled mobile capture shows the full Guide 16 title.

## Header Logo And Actions QA

- Replaced `public/dbs-kaduna-logo.png` with the supplied circular DBS Kaduna logo.
- Verified the rendered logo loads at its natural `256 x 256` resolution.
- Replaced the desktop header Login control with a blue `News` control.
- Changed the main Login control from white to solid blue.
- Verified the main Login dropdown still exposes Student, Instructor, and Admin.
- Verified desktop at `1440 x 900` and mobile at `390 x 844`.
- No broken images, horizontal overflow, or browser runtime errors were found.

## Admin Dashboard QA

- Source specification: `C:\Users\BTC\AppData\Local\Temp\codex-clipboard-329f0beb-a743-41a0-9fbb-3a5044d5f78d.png`
- Desktop screenshot: `C:\Users\BTC\Documents\Website for DBS Kaduna\qa-admin-desktop.png`
- Mobile screenshot: `C:\Users\BTC\Documents\Website for DBS Kaduna\qa-admin-mobile.png`
- Verified first-use password setup and admin login at `/login/admin`.
- Verified all eight dashboard sections and all 26 lesson upload slots.
- Verified student assignment, instructor approval, PDF upload metadata, question
  creation, certificate generation, certificate verification, news publishing,
  and all four Excel-compatible report downloads.
- Verified the mobile navigation drawer and responsive dashboard at `390 x 844`.
- Verified the public homepage still renders after adding the admin routes.
- No page overflow, error overlays, or browser console errors were found.

final result: passed

## Admin Instructor Message Thread QA — 2026-08-11

- Source visual truth: `C:\Users\BTC\AppData\Local\Temp\codex-clipboard-9c33aa66-1874-4a4f-8251-cbca4afd0390.png`
- Intended implementation route: `http://127.0.0.1:4173/admin`
- Intended state: an authenticated administrator has selected an approved instructor; the message thread is empty.
- Intended viewport: desktop, matching the supplied screenshot (approximately `716 x 540` content capture).
- Source dimensions / density: supplied screenshot, `716 x 540` pixels; CSS dimensions and density unavailable.
- Implementation screenshot: unavailable — the unauthenticated preview correctly redirects to `/login/admin`, and no administrator test credentials or authenticated browser state were supplied.

**Comparison Evidence**

The supplied screenshot was available. The browser-rendered login page at `http://127.0.0.1:4173/login/admin` was opened and confirmed to load, but the authenticated instructor-message state could not be captured. A like-for-like full-view or focused-region comparison was therefore not possible.

**Findings**

- [P1] Authenticated message-state capture is unavailable.
  Location: `/admin`, Instructor management message workspace.
  Evidence: the implementation requires valid administrator authentication before an instructor thread can render.
  Impact: visual fidelity, responsive behavior, and message-submission interaction cannot be verified in the target state.
  Fix: provide a safe test administrator session or capture the authenticated workspace in the in-app browser, then compare it with the supplied empty-state screenshot.

**Fidelity Surface Status**

- Fonts and typography: blocked pending an authenticated rendered capture.
- Spacing and layout rhythm: blocked pending an authenticated rendered capture.
- Colors and visual tokens: source uses DBS navy, blue, white, and muted gray; implementation capture is blocked.
- Image quality and asset fidelity: no custom raster asset is required for this message workspace; the supplied source contains no image asset to recreate.
- Copy and content: implementation copy was updated for the empty state and private-message composer; visual verification is blocked.

**Implementation Checklist**

1. Open the authenticated `/admin` message workspace with an approved instructor selected.
2. Capture desktop and narrow-width empty states, plus a populated conversation state.
3. Check the full-width composer, visible focus ring, submit state, and horizontal overflow.
4. Update this QA entry with comparison evidence and a final pass/fail decision.

final result: blocked
