# Vehicle Finder — Requirements

> **Addendum (2026-08-28): camera/OCR scan-to-search built.** Confirmed Product
> Decision #2 below ("v1 ships manual plate-text search only — no camera/OCR")
> is **superseded** — the user explicitly asked for it once the manual-search
> v1 was live, which is exactly the trigger
> [`05-future-scope.md`](./05-future-scope.md)'s original item 1 named. See R10
> below and [`02-architecture.md`](./02-architecture.md)'s OCR Scan-to-Search
> section for the actual shape (client-side `tesseract.js`, photo never
> leaves the browser, a failed read shows an error and hands control back to
> manual typing rather than guessing).
>
> **Addendum (2026-08-28, same day): camera/OCR scan-to-search rolled back —
> R10 withdrawn, Decision #2 reinstated.** Tested against a real device photo
> (a phone camera shot of a car's front plate) before this shipped any wider,
> and it failed outright: (1) the photo carried a normal EXIF "rotate 90°"
> orientation tag — every viewer honors it and shows the plate upright, but
> `recognizeText` fed the raw `File` straight to tesseract with no orientation
> correction, so OCR saw the plate sideways and returned pure noise; (2) even
> after manually correcting the rotation and hand-cropping to just the plate,
> tesseract's generic `eng` model still couldn't produce a clean read against
> India's embossed HSRP plate font — best case was a fragment, never a full
> match, across several crop sizes/grayscale/page-segmentation-mode attempts.
> This is exactly the risk Decision #2 named up front (outdoor plate photos
> are a harder OCR problem than this app's existing clean-screenshot OCR use
> case) — confirmed empirically rather than shipped on assumption. `ocr.ts`
> and `extract-plate.ts` are deleted, the scan control is removed from
> `VehicleFinderPage.tsx`, and `tesseract.js` is dropped from the client's
> dependencies (the server-side `tesseract.js` used by bank-reference OCR is
> unrelated and untouched). See `02-architecture.md` and
> `05-future-scope.md` for the same rollback reflected there.

## Context
- App: Society management system (24 flats, 2 personas — Admin, Resident).
- Residents already ask "whose car is this?" informally over the society
  WhatsApp group whenever a vehicle is blocking a gate, a fire exit, or
  someone else's parking spot. There is no in-app way to answer that
  question.
- Goal: let a resident register their own vehicle(s) once, and let any
  resident look up a plate number to instantly find which flat it belongs
  to — replacing an ad-hoc group message with a lookup.

## Problem Statement
A resident who finds an unfamiliar vehicle blocking access has no way to
identify its owner except posting a photo to the society group and waiting
for someone to recognize it. This is slow, depends on the owner (or someone
who knows them) being active in the group at that moment, and produces no
record of who was contacted or when.

## Confirmed Product Decisions
These were explicitly settled during design discussion and should not be
re-litigated without a new conversation:

1. **A successful lookup reveals flat/wing number, occupant name, and phone
   number.** The point of the feature is to let the searcher act immediately
   (move a blocking car, reach the owner directly) rather than route through
   a third channel — a match that only gives a flat number still leaves the
   searcher needing another lookup (e.g. the Flats directory) to actually
   contact anyone. This is a materially higher privacy exposure than a
   flat-only result, since any resident can now pull another resident's
   phone number just by having seen their parked car — accepted deliberately,
   with no audit trail behind it: audit logging of lookups was considered and
   explicitly declined for this feature, not deferred.
2. **v1 ships manual plate-text search only — no camera/OCR.** Outdoor
   number-plate photos (angle, glare, motion blur, India's plate fonts) are a
   materially harder OCR problem than this app's existing use case (`docs/
   features/bank-reference/`, clean screenshots of payment-app confirmation
   screens). Camera/OCR-assist is deferred to future scope (see
   [`05-future-scope.md`](./05-future-scope.md)) until real plate-photo
   accuracy can be evaluated, not assumed.
3. **A vehicle belongs to the resident who registered it, not the flat.**
   When that resident's tenancy or ownership relation to the flat ends, their
   vehicles are removed rather than left attached to the flat — otherwise a
   departed tenant's car would keep surfacing as belonging to a flat they no
   longer occupy.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | A resident (owner or tenant) can register a vehicle for themselves: plate number + type (`TWO_WHEELER` \| `FOUR_WHEELER`) | Must |
| R2 | A resident can register more than one vehicle | Must |
| R3 | A resident can view and delete only their own registered vehicles | Must |
| R4 | Plate numbers are normalized (uppercase, punctuation/whitespace stripped) on both write and lookup, so `MH12 AB 1234`, `mh-12-ab-1234`, and `MH12AB1234` are treated as the same plate | Must |
| R5 | Plate numbers are unique per society (normalized value) — registering a plate already registered to someone else in the same society is rejected | Must |
| R6 | Any authenticated resident or admin can search a typed plate number and, on a match, see the matching flat's wing/flat number, the registrant's name, and the registrant's phone number | Must |
| R7 | A search with no match returns a plain "not found" result — never an error, never a hint about why (e.g. never distinguishes "not registered" from "registered to a different society") | Must |
| R8 | When a tenant is removed from a flat (`DELETE /api/me/flat/tenant` or the admin equivalent), any vehicles registered by that tenant are deleted | Must |
| R9 | Vehicle Finder search requires authentication — never a public/unauthenticated endpoint | Must |
| R10 | ~~A resident can tap a scan control to capture a photo of a plate; if OCR reads a plausible plate, the search box is prefilled and the search runs automatically...~~ **Withdrawn (2026-08-28) — see the addendum above.** Built, tested against a real device photo, and rolled back the same day. | Must |

## Non-Functional Requirements
- **Low operating cost**: no new paid dependency — a typed-search lookup
  needs nothing beyond the existing database and auth stack.
- **Society-scoped**: registration, listing, and search all go through
  `scopedWhere()` — a plate registered in one society must never be
  findable, or collide on uniqueness, with a search or registration in
  another society.
- **Correctness over scale**: this is a 24-flat convenience feature, not
  billing-critical. Manual search plus OCR scan-assist is the whole feature;
  do not add further speculative capability (rate limiting, contact-request
  flows) ahead of real usage.

## Explicitly Out of Scope
- **Visitor/guest vehicle logging, gate check-in/out, or parking-slot
  assignment** — this feature is strictly resident-owned-vehicle lookup. It
  must not be read as a backdoor into gate/visitor management, which
  `CLAUDE.md` explicitly excludes from this app's scope entirely.
- **Audit logging of lookups** — considered, explicitly declined for this
  feature (not just deferred — see Confirmed Product Decision #1).
- **Rate limiting on lookups** — considered, deferred; see future-scope
  item 1.
- **Opt-out of being findable** — a resident who registers a vehicle is
  always findable by plate; there is no per-vehicle or per-resident privacy
  toggle in v1 (this would undercut the feature's entire purpose). Revisit
  only if a real complaint surfaces.

## Success Criteria
- A resident can register a vehicle in under a minute, without admin
  involvement.
- Searching a plate that belongs to a vehicle registered in the same society
  returns the flat, occupant name, and phone number immediately, with no
  admin step in between.
