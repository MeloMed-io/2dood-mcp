// Bundles the server into one file for npm, so users need Node 20+ and nothing
// else. The public Supabase URL and publishable key are baked in at build time
// from TWODOOD_SUPABASE_URL and TWODOOD_SUPABASE_ANON_KEY (never a secret key).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const url = process.env.TWODOOD_SUPABASE_URL;
const key = process.env.TWODOOD_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Set TWODOOD_SUPABASE_URL and TWODOOD_SUPABASE_ANON_KEY to build.');
if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) throw new Error('unexpected key format');
if (key.includes('secret') || key.startsWith('sb_secret_')) throw new Error('refusing to bundle a secret key');

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  legalComments: 'inline',
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  define: {
    __PKG_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version),
    __TWODOOD_SUPABASE_URL__: JSON.stringify(url),
    __TWODOOD_SUPABASE_KEY__: JSON.stringify(key),
  },
});
console.log('built dist/index.js');

// esbuild keeps the source's dev hashbang (node --disable-warning ...), swap it
// for a portable one.
import { writeFileSync, chmodSync } from 'node:fs';
const out = readFileSync('dist/index.js', 'utf8').replace(/^#![^\n]*\n/, '#!/usr/bin/env node\n');
writeFileSync('dist/index.js', out);
chmodSync('dist/index.js', 0o755);
