# Saral Society — marketing website

Static landing page, no framework. The clickable demo it links to
(`demo/index.html`) is not copied in here: `build.sh` takes it from the
repo's `demo/` folder, so there is only one copy of the demo.

- `index.html` — landing page
- `favicon.svg` — brand mark
- `build.sh` — assembles the published site into `_site/`

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

## Before going live

Replace the `[contact email]` placeholder in the closing section
(`data-contact`) with the real contact address.
