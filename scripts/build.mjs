// Builds the static site for Cloudflare Pages into ./dist.
// Only public web files are copied. Server-side Apps Script (.gs), the
// po-to-teams automation, spreadsheets, tests and repo tooling stay out of
// the published site.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist');

const PUBLIC_EXT = new Set(['.html', '.css', '.js', '.txt', '.ico', '.webmanifest']);
const PUBLIC_FILES = new Set(['_headers', '_redirects']);
const PUBLIC_DIRS = ['assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let count = 0;
for (const name of readdirSync(root)) {
  const src = join(root, name);
  if (!statSync(src).isFile()) continue;
  if (PUBLIC_FILES.has(name) || PUBLIC_EXT.has(extname(name))) {
    cpSync(src, join(out, name));
    count++;
  }
}
for (const dir of PUBLIC_DIRS) {
  const src = join(root, dir);
  if (existsSync(src)) {
    cpSync(src, join(out, dir), { recursive: true });
    count += readdirSync(src).length;
  }
}

if (!existsSync(join(out, 'index.html'))) {
  console.error('Build failed: index.html missing from dist/');
  process.exit(1);
}
console.log(`Built ${count} files into dist/`);
