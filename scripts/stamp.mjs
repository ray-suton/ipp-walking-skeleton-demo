// Cache-busting for static hosting with no build step.
//
// GitHub Pages (and browsers) cache every file for ~10 minutes, so right after a deploy a visitor can
// receive the NEW index.html together with OLD scripts or styles, which breaks the page. Putting a
// content hash in each asset URL (styles.css?v=1a2b3c4d5e) makes new HTML request files that cannot
// be stale anywhere.
//
//   npm run stamp           rewrite the ?v= hashes in index.html (run after changing any asset)
//   node scripts/stamp.mjs --check   exit 1 if the hashes are out of date (the test suite does this too)
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export const ASSETS = ['styles.css', 'src/store.js', 'src/ui.js', 'src/app.js'];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns index.html with every asset URL carrying the hash of that asset's current content. */
export async function stamp(html, read = (path) => readFile(new URL(path, root))) {
  let out = html;
  for (const asset of ASSETS) {
    const hash = createHash('sha256')
      .update(await read(asset))
      .digest('hex')
      .slice(0, 10);
    const pattern = `((?:src|href)=")${escapeRegExp(asset)}(?:\\?v=[0-9a-f]+)?(")`;
    if (!new RegExp(pattern).test(out)) throw new Error(`index.html does not reference ${asset}`);
    out = out.replace(new RegExp(pattern, 'g'), `$1${asset}?v=${hash}$2`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const indexUrl = new URL('index.html', root);
  const current = await readFile(indexUrl, 'utf8');
  const stamped = await stamp(current);
  if (process.argv.includes('--check')) {
    if (stamped !== current) {
      console.error('index.html asset hashes are out of date. Run: npm run stamp');
      process.exit(1);
    }
    console.log('asset hashes are current');
  } else if (stamped === current) {
    console.log('asset hashes already current');
  } else {
    await writeFile(indexUrl, stamped);
    console.log('index.html asset hashes updated');
  }
}
