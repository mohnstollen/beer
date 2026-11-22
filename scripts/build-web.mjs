// Stellt die App-Dateien in www/ zusammen – für GitHub Pages und für die Android-App (Capacitor).
// node scripts/build-web.mjs [version]
import { cp, mkdir, readFile, rm, writeFile, copyFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = join(root, 'www');
const version = process.argv[2] || 'dev';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) await copyFile(join(root, f), join(out, f));
for (const d of ['css', 'js', 'icons']) await cp(join(root, d), join(out, d), { recursive: true });

// Scanner-Bibliothek lokal beilegen (Android-App läuft damit auch offline)
const zxing = join(root, 'node_modules/@zxing/library/umd/index.min.js');
try {
  await access(zxing);
  await mkdir(join(out, 'vendor'), { recursive: true });
  await copyFile(zxing, join(out, 'vendor/zxing.min.js'));
} catch {
  console.warn('Hinweis: @zxing/library nicht installiert – Web-Scanner lädt die Bibliothek bei Bedarf aus dem Netz.');
}

// Service-Worker-Cache an die Version koppeln
const swPath = join(out, 'sw.js');
const sw = await readFile(swPath, 'utf8');
await writeFile(swPath, sw.replace(/^const VERSION = .*$/m, `const VERSION = '${version}';`));
console.log(`www/ gebaut (Version ${version})`);
