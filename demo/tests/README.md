# Demo checks

Automated checks for the clickable demo, run in a headless browser against
the site exactly as `website/build.sh` publishes it. Run them before showing
a client a changed demo, and before merging to `product`.

## Setup (once)

```sh
cd e2e && npm ci          # Playwright and its browser
cd ../demo && npm install # json-server
```

The checks borrow Playwright from `e2e/`, so the demo has no extra
dependencies.

## Run

The tests load React from a CDN, so they need a network connection.

```sh
cd demo && npm test
```

| Script | Checks |
|---|---|
| `routes.mjs` | Screen links (`#owner/passbook`), link changes, old `#billing` links, fallbacks, logout, PRD labels toggle |
| `presets.mjs` | The example client preset: branding, hidden features, "Requested" override, reset, unknown or invalid names |
| `persist.mjs` | Saved data survives reload, per-preset copies, reset, edited seed, full storage, json-server writes, presets never writing to json-server |
| `pitch.mjs` | Pitch mode on desktop and phone: labels off without changing the saved choice, the guide's three steps and buttons, reload, hide, start again |

Each prints one PASS or FAIL line per check and exits non-zero on a failure.

## Before/after snapshots

For a change that shouldn't alter what anyone sees (a refactor, moving code
between files), compare DOM snapshots of every screen, popup and
cross-persona flow. The clock and random numbers are fixed, so any
difference is a real change.

```sh
git stash                                  # or check out the old version
./website/build.sh /tmp/site-before
node demo/tests/snapshots.mjs /tmp/site-before /tmp/snap-before
git stash pop
./website/build.sh /tmp/site-after
node demo/tests/snapshots.mjs /tmp/site-after /tmp/snap-after
diff -r /tmp/snap-before /tmp/snap-after   # no output = nothing changed
```

Snapshots are taken with PRD labels off. The script clicks through the
shared demo's data (Priya, Arjun, Sanjay, Ramesh), so update it if that
sample data changes.
