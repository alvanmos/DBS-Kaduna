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

final result: passed
