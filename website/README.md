# Saral Society — marketing website

Static site, no build step. Open `index.html` in a browser.

- `index.html` — landing page
- `favicon.svg` — brand mark
- `demo/` — static copy of the clickable demo from the
  `demo/clickable-mockup-stage-1` branch (`index.html`, `js/`, `db.json`,
  `db.seed.json`). With no API behind it, it runs on `db.json` in the
  browser.

## Publishing

GitHub Pages serves the `gh-pages` branch, which holds the contents of this
folder at its root. To update it, copy `website/*` onto `gh-pages` and push.

## Before going live

Replace the `[contact email]` placeholder in the closing section
(`data-contact`) with the real contact address.
