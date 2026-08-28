# Vehicle Finder — Future Scope

Everything below is **deliberately not built in v1**. Documented so the path
is clear if a real need appears — not so it gets scheduled prematurely.
Re-read [`01-requirements.md`](./01-requirements.md) before starting any item
here to confirm the trigger is real, not anticipated (same discipline
`docs/features/bank-reference/05-future-scope.md` applies to its own deferred
items).

## 1. Rate Limiting on Lookups
**What**: cap how many searches one resident can perform per day, to bound
how much of the parking lot one person could systematically look up.
**Trigger**: a resident reports being repeatedly looked up, or the committee
otherwise learns of a directory-building pattern — since v1 has no audit
trail (Confirmed Product Decision #1), this would surface as a complaint,
not as something discovered from logs.
**Why not now**: speculative for a 24-flat app where the honest use case
("I saw one car, who does it belong to") never needs more than a handful of
searches a day anyway; not worth building against a hypothetical misuse
pattern with no evidence behind it.
**Cost to add**: small — this app already has `express-rate-limit` wired for
login/password-reset; extending it to a new route is a small, well-trodden
addition.

## 2. Audit Logging of Lookups
**What**: record who searched what plate, when, and whether it hit or
missed (`AuditLog`, mirroring this app's existing audit-logging convention
for sensitive actions).
**Trigger**: a real complaint or incident where "who looked up my car" needs
an answer and there is no way to reconstruct it.
**Why not now**: explicitly declined for v1 (Confirmed Product Decision #1)
— logging every lookup of another resident's name and phone number is
itself a privacy-sensitive record, and building it speculatively ahead of
any actual incident was judged not worth the added surface for a 24-flat
app.
**Cost to add**: small-to-moderate — one `AuditLog` write per search plus
deciding how a miss (no matched entity) is represented in a polymorphic,
non-nullable `entityId`.

## 3. Opt-Out of Findability
**What**: let a resident mark their own vehicle (or themselves) as excluded
from Vehicle Finder results.
**Trigger**: a resident raises a specific privacy objection in practice.
**Why not now**: undercuts the feature's entire purpose (an unfindable
registered vehicle defeats "find who owns this car") — not worth building
against a hypothetical objection.
**Cost to add**: small — one boolean field on `Vehicle`, one filter in the
search query.

## 4. Visitor/Guest Vehicle Logging or Gate Integration
**What**: track non-resident vehicles (visitors, delivery, cabs) or tie
Vehicle Finder into a gate check-in/out flow.
**Trigger**: only if gate/visitor management is ever brought into this app's
scope at the `CLAUDE.md` level — currently and explicitly excluded.
**Why not now**: a different domain entirely; bolting it onto Vehicle Finder
would be exactly the scope creep `01-requirements.md`'s "Explicitly Out of
Scope" section calls out.
**Cost to add**: large — a new domain (visitor records, check-in/out state,
likely a different persona entirely), not an extension of this feature.

## Guiding Rule for All of the Above
Don't build any item in this document until the specific trigger listed next
to it has actually happened.

## 5. Camera/OCR Plate-Scan Assist (built and rolled back 2026-08-28, same day)
**What**: a camera/scan control that captures a plate photo and OCRs it
client-side (`tesseract.js`) into the search box.
**Trigger**: the user explicitly asked for it once the manual-search v1
shipped — exactly the trigger originally named here when this was item 1.
**Tried and reverted**: built the same day, then tested against a real
device photo before shipping any wider — it failed. Two distinct problems:
(1) the photo's EXIF orientation was never corrected before handing it to
tesseract, so a normal (sideways-stored) phone photo read as pure noise;
(2) even after manually correcting orientation and hand-cropping to just the
plate, tesseract's generic `eng` model still couldn't produce a clean read
against India's embossed HSRP plate font. See `01-requirements.md`'s second
2026-08-28 addendum and `02-architecture.md`'s OCR Scan-to-Search section for
the full detail — both kept as architecture-as-built history rather than
deleted.
**Why not now**: this is exactly the risk the original "why not now"
reasoning named up front (outdoor plate OCR is a materially harder problem
than this app's existing clean-screenshot OCR use case) — now confirmed
empirically rather than assumed. Revisit only with either a cropping/preview
step before OCR runs, or a plate-specific model — not stock tesseract against
a full uncropped photo.
**Cost to add**: was "small" before this was tried; now known to require
real preprocessing (crop-to-plate UI, orientation correction) or a different
OCR engine entirely — no longer a small add.
