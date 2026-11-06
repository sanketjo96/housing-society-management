# Saral Society — clickable demo

The full Saral Society front end (admin web dashboard, resident app and guard
app) running on mock data. UI only: no real backend, nothing touches the
production app in `client/` and `server/`.

## Run it with json-server (data is saved)

```sh
cd demo
npm install
npm start
```

Open <http://localhost:3001>. json-server serves the app and the API from the
same port, and saves every change to `db.json`. The badge in the bottom-left
corner reads **Live API · localhost:3001**.

To start over: use **Reset demo** in the app, or stop the server, run
`npm run reset`, and start it again.

`npm run start:watch` also reloads `db.json` when you edit it by hand. Don't
use it while clicking through the app: json-server reloads after its own
writes too, and requests made during a reload fail.

## Run it without a server (data is saved in the browser)

Any static host works, for example GitHub Pages or `npx serve .`. With no API
answering, the app loads `db.json` as sample data and saves changes in that
browser (localStorage), so a client can click through, close the tab, and
come back to the same state. The badge reads **Sample data · saved in this
browser**. **Reset demo** clears it.

Each client preset keeps its own saved copy. The copy is tied to a
fingerprint of the sample data, so when you change `db.seed.json` and
republish, visitors start on the new data instead of an old saved copy. If
the browser refuses to store more (private mode, or storage full after many
uploaded screenshots), the demo keeps working for that tab and the badge
switches to **this tab only**.

Opening `index.html` straight from disk (`file://`) doesn't work, because
browsers block loading `db.json` that way.

The public copy at `/demo/` on the marketing site is built from this folder
automatically (see `website/README.md`). It uses `db.seed.json` as its data,
so edit that file to change what visitors see.

## Link to a screen

Every screen has its own link, `#<persona>/<screen>`. Opening one signs in as
that persona straight away (it's a demo), so you can send a client the exact
screen to look at, or link to it from the PRD.

| Persona | Screens |
|---|---|
| `admin` | `dashboard`, `review`, `billing`, `receipts`, `flats`, `expenses`, `complaints`, `amenities`, `visitors`, `notices`, `notifications`, `settings` |
| `owner`, `tenant` | `home`, `passbook`, `requests` (`requests/bookings` for the bookings tab), `gate`, `profile` |
| `guard` | `gate`, `verify`, `log`, `flats` |

For example `…/demo/#owner/passbook` or `…/demo/#admin/notices`. The address
bar follows you as you move around, so you can also just copy it. Older links
like `#billing` still open the admin page.

## PRD labels

Each screen shows which PRD section it demonstrates and that section's status
(Built, Partly built, Designed, New, or Requested). Nav items and home-screen
tiles are tagged only when the feature isn't built yet, so a client can see
what is live and what is a proposal.

Labels are on by default. Turn them off with **PRD labels** in the
bottom-left badge (the choice is remembered in that browser), or with
`?labels=0` / `?labels=1` in the link. The mapping lives in `js/prd.js` and
follows the section headings in `docs/product/prd.md` §7; update both
together.

## Pitch mode

For investors, or for a link someone will click through on their own
(often on a phone, where the side panel with the demo steps is hidden), add
`?pitch=1`:

```
…/demo/?pitch=1
…/demo/?client=example&pitch=1
```

- PRD labels are off for that visit. The visitor's saved labels choice isn't
  changed.
- A small guide walks through the payment loop: Priya pays, Sanjay approves,
  the receipt is ready. Each step has a button that opens the right screen.
  The guide works out the step from the data, so it keeps up when someone
  switches person, reloads, or uses Reset demo. It hides while a sheet or
  popup is open, and can be collapsed to a small button.

## Client presets

A preset tailors the demo for one client without touching the shared demo:
their society's name and branding, which features they see, and which
features they have asked for. Open it with `?client=<id>`, which loads
`clients/<id>.json`:

```
…/demo/?client=example
…/demo/?client=example#admin/notices
```

`clients/example.json` is a worked example. Copy it to start a new client.

| Field | What it does |
|---|---|
| `name` | Shown in the bottom-left badge |
| `society` | Laid over `society` in the data: `name`, `short`, `display`, `locality`, `address`, `regNo`, `accountNo`, `stamp` |
| `meta`, `settings` | Laid over the same objects in the data, e.g. `meta.upiId`, `settings.baseRate` |
| `features` | Set a feature to `false` to hide it everywhere (nav, home tiles, tabs, dashboard): `complaints`, `notices`, `amenities`, `gate` (gate passes, visitor log and the guard persona), `notifications`, `expenses` |
| `prd` | Overrides a PRD section's status for this client, e.g. `{ "7.13": { "status": "requested", "note": "Asked for on 12 Nov" } }` |
| `data` | Optional path to a full data file (same shape as `db.seed.json`), e.g. `clients/acme.db.json`, for a client whose flats and people differ |

A preset always runs on sample data in the visitor's browser, even when
json-server is running, so a client demo never changes the shared data. The
building view, wing names and flat counts come from the data, so a `data`
file with a different number of floors or flats renders correctly, as long as
it has the same shape as `db.seed.json`: `wing`, `floor` and `unit` on every
flat, and `society.display`, `society.locality`, `society.stamp` and
`meta.trend` (see `API.md`).

## From client request to built feature

The demo is where a client's idea is tried out before anyone writes backend
code. Its output is the PRD; the real app on `main` is built from the PRD.

1. **Log it.** Add a row to [`docs/product/requests.md`](../docs/product/requests.md)
   with status *Requested*.
2. **Branch.** Create `demo/<client>-<feature>` from `product`. Pushes to
   `product` republish the public site, so work on the branch.
3. **Prototype.**
   - Give the client a preset if they don't have one: copy
     `clients/example.json` to `clients/<client>.json`.
   - A change to an existing feature goes in that feature's file in
     `js/features/`. A new feature gets a new file there, wired into the app
     shell that shows it (`js/apps/`).
   - If only this client should see it, add its name to `OFF_BY_DEFAULT` in
     `js/core.js` and switch it on in their preset (`"features": { "<name>": true }`).
     The shared demo stays as it is.
   - Map the new screens in `js/prd.js`. Use the next free §7 number and
     status `new`, or mark an existing section `requested` in the preset's
     `prd` block.
4. **Check it.** Run `npm test` in `demo/` (setup in `tests/README.md`).
   **Show it.** Run it locally (`npm start`, then `?client=<client>`), or merge
   to `product` once it can't affect the shared demo and send the client the
   link (`…/demo/?client=<client>#admin/<screen>`). Set the request to
   *Prototyped*.
5. **Write it down.** When the client agrees, add or update the PRD §7
   section: what it does, who uses it, acceptance criteria, and the demo link.
   If it reverses an earlier decision, add a record in `docs/decisions/`. Set
   the request to *Agreed* and merge to `product`. If the feature is on
   `CLAUDE.md`'s out-of-scope list (notices, gate passes, facility booking),
   *Agreed* is what brings it into scope: remove its bullet there on `main`
   (see `docs/decisions/0009-…`).
6. **Build it on `main`** from the PRD section, not from the demo code. The
   demo's data model and `API.md` are a prototype, not the backend contract.
   When it ships, change the section to *Built* in both the PRD and
   `js/prd.js`, and set the request to *Built*.

## Point it at another API

- `?api=http://localhost:4000` in the URL, or
- set `apiBase` in `js/config.js` (`''` forces sample data in memory).

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell and styles |
| `js/main.js` | Entry point: loads data, picks the app for the signed-in persona |
| `js/core.js` | Shared helpers: React/htm, icons, formatting, balance maths (`flatSummary`, `rateFor`) |
| `js/prd.js` | Which PRD section each screen demonstrates, and its status |
| `js/tour.js` | Pitch mode and its guide |
| `js/route.js` | Screen links (`#owner/passbook`) |
| `js/ui.js` | Shared components: Modal, Drawer, Sheet, Field, Receipt, Facade, persona side panel |
| `js/features/*.js` | One file per feature (payments, billing, notices, gate, …): its admin screen and resident sheets |
| `js/apps/*.js` | The three shells: admin web, resident phone app, guard phone app, plus the login page |
| `js/api.js` | Data layer: loads data, turns each change into REST calls |
| `clients/*.json` | Client presets (see above) |
| `tests/` | Automated checks: `npm test` (see `tests/README.md`) |
| `js/config.js` | Which API to use |
| `db.json` | Mock data that json-server reads and writes |
| `db.seed.json` | Original mock data, used by Reset demo |
| `API.md` | Endpoints, data fields, and every write action with the endpoint a real backend should provide |

React 18 and htm load from a CDN; the modules are native ES modules, so there
is still no build step.

Imports only point one way: `core`, `prd`, `route` → `ui` → `features` → `apps` → `main`.
A feature never imports another feature; anything two features share moves
down into `core.js` or `ui.js`. This keeps a client-specific change in one
feature file from breaking the rest of the demo.

## Logins

| Persona | Email | Lands on |
|---|---|---|
| Sanjay Gujarathi, Treasurer | admin@saralsociety.demo | Admin web dashboard |
| Priya Nair, Owner A-302 | resident@saralsociety.demo | Resident app |
| Arjun Mehta, Tenant A-302 | tenant@saralsociety.demo | Resident app |
| Ramesh Patil, Guard | guard@saralsociety.demo | Guard app |

Password for all: `demo123`. The persona cards on the login page sign in with
one tap.

## Flows to show

1. Priya pays, Sanjay approves, Arjun sees the receipt.
2. Priya creates a gate pass, Ramesh verifies it, the pass shows as used.
3. Ramesh logs a walk-in for A-302, Priya allows it from her phone.
4. Arjun raises a complaint, Sanjay resolves it, Arjun sees the update.

Notices, amenity booking and gate passes are shown as roadmap features. They
are out of scope for the current MVP in `CLAUDE.md`.
