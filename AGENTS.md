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
- Present every administration workspace with a consistent branded hero, clear page hierarchy, structured content panels, and responsive spacing, while preserving all management controls.
- Lay out question-order cards horizontally: let the prompt use the full available row width, with the type selector and action controls arranged across a separate full-width control row.
- Keep the admin Zoom Classes filters, register, attendance details, and actions in clearly separated responsive grids; never allow labels or meeting details to overlap.
- Keep the Students directory searchable, filterable, and paginated; administrators can select active students and send them a private dashboard notice in one action.
- Surface each student with gradeable submissions awaiting marking alongside the responsible instructor on the administration dashboard.
- Support student, instructor, lesson, question, certificate, report, and news management.
- Keep all 26 lesson upload slots visible and identify lesson PDFs as protected content.
- Treat the current browser-persisted data and password setup as prototype behavior only.
- Production authentication, private file delivery, shared records, and password email
  delivery require a secure backend and transactional email provider.

## Recruitment and News Direction

- Keep student and volunteer instructor registration on role-specific shared forms.
- Feature “It's Totally Free” prominently on the student registration page.
- Let administrators create named, trackable QR recruitment campaigns for either role.
- Keep campaign enrollee names, phone numbers, addresses, and export controls visible only in administration.
- Show the latest published news headline and date as moving text immediately above the homepage title.
- Blink the homepage News control for seven days after the newest publication, while respecting reduced-motion preferences.
- Keep QR campaign titles private to administrators and allow administrators to delete campaigns.
- Let administrators publish and modify student and volunteer-instructor registration forms, including compulsory and optional fields.
- Student accounts are available immediately with the password chosen at registration; volunteer instructors can sign in with their chosen password only after administrator approval.

## Learning Portal Direction

- Organize student and instructor portals with the same branded sidebar, active-section navigation, responsive mobile drawer, and focused workspace pattern used by administration, while preserving all learning, marking, messaging, certificate, and data-control functionality.
- Keep student access on `/login/student` and `/student`, and instructor access on `/login/instructor` and `/instructor`.
- Make the student Online classes workspace equally organized and polished, with a branded hero, concise class summary, clear schedule hierarchy, and responsive composition.
- Make the student Messages workspace a full-width, polished counterpart to “My details,” with the same branded hero treatment, well-defined conversation area, and responsive composition.
- Classify student accounts with no dashboard activity for 60 days as inactive without deleting their records, then send a one-time email with a secure account-reactivation link.
- Student dashboards must show the assigned instructor, all 26 lessons and statuses, online answers, marking feedback, progress, and approved certificate downloads.
- Keep the student "My details" workspace full-width, with a polished responsive multi-column profile form on larger screens.
- Present student lesson questions one at a time in a bold, colourful sequence; require each answer to be submitted before revealing the Next Question control.
- Instructor dashboards must show only assigned students, support lesson locks, marking and comments, correction returns, completion, and graduation requests.
- Keep the instructor Student reviews and Messages student lists alphabetized, serially numbered from 1, and paginated at six students per page.
- Present submitted, gradeable instructor-review questions one at a time in a bold, colourful sequence; require a saved score before revealing the Next Question control, and exclude Thought Questions from grading.
- Collect a password immediately after Username on each registration form; passwords are sent only to Supabase Auth, never stored in registration data or emailed in plaintext.
- Send each newly registered student the supplied DBS Kaduna welcome letter as a PDF attachment.
- Keep the welcome letter downloadable from the student dashboard and keep its PDF download control blinking, respecting reduced-motion preferences.
- Keep enabled lesson PDF controls blinking on both learning dashboards to prompt instructors and students to open or download their study material, respecting reduced-motion preferences.

## Privacy and Communication Direction

- Show a short Privacy Notice on both student and volunteer-instructor registration pages.
- Keep an unchecked, compulsory privacy-consent checkbox on every registration form.
- Position the privacy-consent checkbox after every other registration field, immediately before the registration action, on both forms.
- Let students correct their saved registration and contact data from their dashboard and provide a prototype delete-data action there.
- Support bidirectional messaging between each student and the assigned instructor inside the learning portal.
- Support bidirectional messaging between administration and volunteer instructors inside the administration and instructor portals.
- Keep the landing-page "How it works" section aligned to the eight DBS Kaduna study-journey steps supplied by the user.
