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

## Run it without a server (data stays in the browser)

Any static host works, for example GitHub Pages or `npx serve .`. With no API
answering, the app loads `db.json` as sample data and keeps changes only in
that browser tab. The badge reads **Sample data · this browser only**.

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
| `js/route.js` | Screen links (`#owner/passbook`) |
| `js/ui.js` | Shared components: Modal, Drawer, Sheet, Field, Receipt, Facade, persona side panel |
| `js/features/*.js` | One file per feature (payments, billing, notices, gate, …): its admin screen and resident sheets |
| `js/apps/*.js` | The three shells: admin web, resident phone app, guard phone app, plus the login page |
| `js/api.js` | Data layer: loads data, turns each change into REST calls |
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
