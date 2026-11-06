# 0009 — Demo-only features enter the app's scope through the requests log

**Status**: Accepted (process; no feature scope changes)

## Context

`CLAUDE.md`'s "Do not touch / out of scope" list excludes notices,
gate/visitor management and facility booking from the app on `main`. The
clickable demo on the `product` branch prototypes all three (PRD §7.13
Notices, §7.14 Amenity booking, §7.15 Gate passes and visitor management,
all status *New*), because showing them to clients is how we learn whether
they are wanted.

Read literally, the out-of-scope list would make work on `main` refuse a
feature even after a client has agreed to it and the PRD describes it. Read
loosely, the demo and PRD could be taken as permission to build features
nobody has agreed to.

## Decision

These features stay out of scope on `main` until their PRD section is
marked *Agreed* in `docs/product/requests.md`. That row, plus the PRD
section's acceptance criteria, is what brings a feature into scope. The
demo or a *New* PRD status on its own is not.

When a feature becomes *Agreed*:
- its bullet is removed from `CLAUDE.md`'s out-of-scope list on `main`;
- it gets a feature doc in `docs/features/` like any other;
- if the agreed version is narrower than the demo, the narrower version is
  the scope (as 0007 did for complaints).

## Consequences

- `CLAUDE.md`'s out-of-scope bullets for notices, gate/visitor management
  and facility booking now name this gate instead of excluding them with
  no way back in.
- Nothing about what is in scope today changes: none of the three is
  *Agreed* as of this record.
- The demo can keep prototyping anything a client asks about without that
  being read as a commitment to build it.
