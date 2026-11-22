// Minimaler WebDAV-Server für Tests der Synchronisation (verhält sich wie Nextcloud mit erlaubtem CORS).
// node scripts/webdav-mock.mjs [port] [user] [password] [allowedOrigin]
import { createServer } from 'node:http';

const port = Number(process.argv[2] || 8090);
const user = process.argv[3] || 'max';
const pass = process.argv[4] || 'geheim';
const allowed = process.argv[5] || '*';
const files = new Map(); // path → {body: Buffer, type}
const dirs = new Set(['/', '/remote.php/', '/remote.php/dav/', '/remote.php/dav/files/', `/remote.php/dav/files/${user}/`]);
const log = [];

function cors(req, res) {
  const origin = req.headers.origin;
  if (allowed === '*' || origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, MKCOL, PROPFIND, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

createServer(async (req, res) => {
  cors(req, res);
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (path === '/__log') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ log, files: [...files.keys()] })); return; }
  const expected = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  if (req.headers.authorization !== expected) { res.writeHead(401).end(); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  log.push(`${req.method} ${path}`);
  const parent = path.replace(/[^/]+\/?$/, '');
  if (req.method === 'MKCOL') {
    const p = path.endsWith('/') ? path : path + '/';
    if (dirs.has(p)) { res.writeHead(405).end(); return; }
    if (!dirs.has(parent)) { res.writeHead(409).end(); return; }
    dirs.add(p); res.writeHead(201).end(); return;
  }
  if (req.method === 'PUT') {
    if (!dirs.has(parent)) { res.writeHead(409).end(); return; }
    files.set(path, { body, type: req.headers['content-type'] || 'application/octet-stream' });
    res.writeHead(201).end(); return;
  }
  if (req.method === 'GET') {
    const f = files.get(path);
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': f.type }).end(f.body); return;
  }
  res.writeHead(405).end();
}).listen(port, () => console.log(`WebDAV-Mock auf http://localhost:${port}/ (Nutzer ${user})`));
