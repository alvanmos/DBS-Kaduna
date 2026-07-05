# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Confirmed Homepage Direction

- Use the selected "Open Book Welcome" layout.
- Place paired logos and compact navigation across the top.
- Use the supplied circular Discover Bible School Kaduna logo in the header.
- Use a blue News control in the desktop header and a blue Login dropdown with role options in the main actions.
- Center the welcome message and registration actions above a five-cover carousel.
- Use the supplied study guide covers without altering their artwork.
- Finish the page with a full-width WhatsApp help band.
- Favor white space, navy, green, and restrained warm-gold accents.
- Preserve keyboard access, reduced-motion behavior, and small-screen usability.

## Admin Dashboard Direction

- Keep administration on `/login/admin` and `/admin`, separate from the public homepage.
- Use the same DBS Kaduna navy, green, white, and warm-gold visual system.
- Support student, instructor, lesson, question, certificate, report, and news management.
- Keep all 26 lesson upload slots visible and identify lesson PDFs as protected content.
- Treat the current browser-persisted data and password setup as prototype behavior only.
- Production authentication, private file delivery, shared records, and password email
  delivery require a secure backend and transactional email provider.

## Recruitment and News Direction

- Keep student and volunteer instructor registration on role-specific shared forms.
- Let administrators create named, trackable QR recruitment campaigns for either role.
- Keep campaign enrollee names, phone numbers, addresses, and export controls visible only in administration.
- Show the latest published news headline and date as moving text immediately above the homepage title.
- Blink the homepage News control for seven days after the newest publication, while respecting reduced-motion preferences.
- Keep QR campaign titles private to administrators and allow administrators to delete campaigns.
- Let administrators publish and modify student and volunteer-instructor registration forms, including compulsory and optional fields.
- Student accounts receive secure setup-email links immediately after registration; volunteer instructors receive access only after administrator approval.

## Learning Portal Direction

- Keep student access on `/login/student` and `/student`, and instructor access on `/login/instructor` and `/instructor`.
- Classify accounts with no dashboard activity for 30 days as inactive in administration without deleting their records.
- Student dashboards must show the assigned instructor, all 26 lessons and statuses, online answers, marking feedback, progress, and approved certificate downloads.
- Instructor dashboards must show only assigned students, support lesson locks, marking and comments, correction returns, completion, and graduation requests.
- Account emails must use secure invitation/password-setup links; never email plaintext passwords.

## Privacy and Communication Direction

- Show a short Privacy Notice on both student and volunteer-instructor registration pages.
- Keep an unchecked, compulsory privacy-consent checkbox on every registration form.
- Let students correct their saved registration and contact data from their dashboard and provide a prototype delete-data action there.
- Support bidirectional messaging between each student and the assigned instructor inside the learning portal.
- Support bidirectional messaging between administration and volunteer instructors inside the administration and instructor portals.
- Keep the landing-page "How it works" section aligned to the eight DBS Kaduna study-journey steps supplied by the user.
