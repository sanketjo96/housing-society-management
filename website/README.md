# Saral Society — marketing website

Static landing page, no framework. The clickable demo it links to
(`demo/index.html`) is not copied in here: `build.sh` takes it from the
repo's `demo/` folder, so there is only one copy of the demo.

- `index.html` — landing page
- `favicon.svg` — brand mark
- `build.sh` — assembles the published site into `_site/`
- `preview.jpg` (and `demo/preview.jpg`) — link-preview images, made by `make-previews.mjs`

## Preview locally

```sh
./website/build.sh      # from the repo root; writes _site/
npx serve _site         # landing page at /, demo at /demo/
```

Opening `website/index.html` directly shows the landing page, but its demo
links only work in the built `_site/`.

## Publishing

Don't edit the `gh-pages` branch by hand. Every push to the `product` branch
that touches `website/` or `demo/` runs `.github/workflows/publish-site.yml`,
which runs `build.sh` and replaces `gh-pages` with the result. It can also be
run by hand from the repo's Actions tab ("Publish site" → Run workflow).

The demo is published with `demo/db.seed.json` as its data, so changes made
while clicking through a local json-server session never reach the public
site. To change the sample data people see, edit `db.seed.json`.

GitHub Pages must be enabled for the repo (Settings → Pages → Deploy from a
branch → `gh-pages`, `/ (root)`). Pages on a private repo needs a paid
GitHub plan; otherwise make the repo public or host `_site/` elsewhere
(Cloudflare Pages, Netlify).

## Contact address

The closing section links to sanketjoshi96@gmail.com (the `data-contact`
element in `index.html`). Change it there if the address changes.

## Link previews

When someone shares a link on WhatsApp, LinkedIn or Slack, the card shows
`preview.jpg` (landing page) or `demo/preview.jpg` (demo), set by the `og:`
tags in each page's `<head>`. After a visible design change, remake them
from the real pages and commit the images:

```sh
node website/make-previews.mjs   # needs Playwright from e2e/ (cd e2e && npm ci)
```

The tags use absolute URLs (`https://sanketjo96.github.io/…`). If the site
moves to its own domain, change them in both `index.html` files.

WhatsApp caches a link's preview for a long time. To see a new one, share
the link with something extra on the end, e.g. `?v=2`.
