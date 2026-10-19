// Local, synthetic fixtures only. No proxy, credentials, production API or external writes.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const root = resolve('apps/web/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const marker = { schemaVersion: 1, source: 'https://github.com/trapd00r/win95-winxp_icons', commit: '728a866ad59a54fd4082dbe000e1e62e50bd90e9', fileCount: 1193, license: 'NOASSERTION' };
createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5197');
  const send = (body, type = 'application/json', cache = 'no-store', status = 200) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Length': Buffer.byteLength(body) }); res.end(body);
  };
  if (url.pathname === '/windows-icons/.retro-icon-pack.json') return send(JSON.stringify(marker), 'application/json', 'no-store', req.headers.cookie?.includes('quality-pack=missing') ? 404 : 200);
  if (url.pathname.startsWith('/windows-icons/')) return send('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="teal"/></svg>', 'image/svg+xml', 'public,max-age=3600');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.match(/fixture-(empty|normal|heavy)/)?.[1] ?? 'normal';
    const documents = JSON.parse(readFileSync('tests/tmp/quality-fixtures.json', 'utf8'));
    const document = documents[name];
    if (url.pathname.includes('/assets')) return send('{"assets":[]}');
    if (req.method !== 'GET') return send('{"error":"measurement fixture is read-only"}', 'application/json', 'no-store', 405);
    const site = { id: `fixture-${name}`, username: `fixture-${name}`, site_name: `Fixture ${name}`, draft_document: document, draft_version: 2, published_document: document, published_version: 2, published_at: '2026-10-18T00:00:00Z', updated_at: '2026-10-18T00:00:00Z', access_role: 'owner' };
    return send(JSON.stringify({ site }));
  }
  if (url.pathname.startsWith('/quality-image/')) return send(readFileSync('tests/tmp/quality-image.png'), 'image/png', 'public,max-age=3600');
  const path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (path !== root && !path.startsWith(root + sep)) return send('Not found', 'text/plain', 'no-store', 404);
  if (existsSync(path) && extname(path)) return send(readFileSync(path), types[extname(path)] ?? 'application/octet-stream', url.pathname.startsWith('/assets/') ? 'public,max-age=3600' : 'no-cache');
  if (extname(path)) return send('Not found', 'text/plain', 'no-store', 404);
  send(readFileSync(resolve(root, 'index.html')), 'text/html', 'no-cache');
}).listen(5197, '127.0.0.1', () => console.log('Quality fixture server on 127.0.0.1:5197'));
