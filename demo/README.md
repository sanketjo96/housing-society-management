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

## Point it at another API

- `?api=http://localhost:4000` in the URL, or
- set `apiBase` in `js/config.js` (`''` forces sample data in memory).

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell and styles |
| `js/app.js` | All screens (React 18 + htm, no build step) |
| `js/api.js` | Data layer: loads data, turns each change into REST calls |
| `js/config.js` | Which API to use |
| `db.json` | Mock data that json-server reads and writes |
| `db.seed.json` | Original mock data, used by Reset demo |
| `API.md` | Endpoints, data fields, and every write action with the endpoint a real backend should provide |

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
