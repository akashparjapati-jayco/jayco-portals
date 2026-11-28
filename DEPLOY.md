# Deploying JAYCO Portals on Cloudflare Pages

The portals are plain static HTML, CSS and JS (no framework). A small build
script copies only the public web files into `dist/`, so the Apps Script
backends (`*.gs`), the `po-to-teams/` automation, the price-list spreadsheet
and repo tooling are **not** published.

## One-time setup (Cloudflare dashboard)

1. Go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the GitHub account `akashparjapati-jayco` and the repo **jayco-portals**.
3. Enter these settings exactly:

| Setting | Value |
|---|---|
| Project name | `jayco-portals` (any name works; it becomes `jayco-portals.pages.dev`) |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave empty)* |

4. **Environment variables:** none are required. Optionally add
   `NODE_VERSION` = `22` (the repo also has a `.nvmrc` with 22, which Cloudflare reads).
5. Click **Save and Deploy**. The first build takes about a minute.

## Custom domain

After the first deploy: open the project → **Custom domains → Set up a custom
domain** → enter your domain (for example `jaycoprt.com` or
`portal.jaycohousing.com`). If the domain's DNS is on Cloudflare it is wired up
automatically; otherwise add the CNAME record Cloudflare shows you.

## How deploys work after that

- Every push to `main` deploys to production automatically.
- Because of `.github/workflows/auto-merge.yml`, anything pushed to a
  `claude/*` branch is merged into `main` and therefore goes live within minutes.
- Every other branch (and every pull request) gets its own preview URL such as
  `https://<branch>.jayco-portals.pages.dev`. To turn previews off, go to
  **Settings → Builds & deployments → Preview deployments → None**.

## What the extra files do

| File | Purpose |
|---|---|
| `package.json` | Defines `npm run build` (no dependencies to install). |
| `scripts/build.mjs` | Copies `*.html`, `*.css`, `*.js`, `robots.txt`, `_headers`, `_redirects` and `assets/` into `dist/`. |
| `_headers` | Security headers, `noindex` for search engines, and a one-week cache for `/assets/*`. |
| `.nvmrc` | Pins Node 22 for the Cloudflare build. |
| `.gitignore` | Keeps `dist/` out of git. |

Pages get clean URLs automatically: `/erp` serves `erp.html`, and Cloudflare
redirects `/erp.html` to `/erp`. Existing links between portals keep working.

No `wrangler.toml` is added on purpose: with Git integration the dashboard
settings above are the source of truth, and a `wrangler.toml` would override them.

## Adding a new portal page

Put the new `.html` file in the repo root (and any images in `assets/`). The
build picks it up automatically. If you add a new kind of public file (for
example `.json` or `.svg` at the root), add its extension to `PUBLIC_EXT` in
`scripts/build.mjs`.

## Test the build locally

```bash
npm run build          # creates dist/
npx wrangler@3 pages dev dist   # optional: serve it like Cloudflare does
```
