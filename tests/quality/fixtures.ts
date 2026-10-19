import { createStarterDocument, makeWindow, makeGalleryImage, migrateSiteDocumentV2, duplicateProfile } from '@retrodesk/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export const session = { access_token: 'a.b.c', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'fixture-owner', email: 'fixture@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } };
function fixture(name: string, count: number, profiles: number) {
  const document = createStarterDocument(`Fixture ${name}`, 'classic98', 'blank');
  if (count) {
    const about = makeWindow('about', 0); about.id = 'about'; about.title = 'About.exe'; about.icon = 'haiku:folder';
    const gallery = makeWindow('gallery', 1); gallery.id = 'gallery'; gallery.title = 'Photos.exe';
    if (gallery.type === 'gallery') gallery.content.images = Array.from({ length: count }, (_, i) => makeGalleryImage({ id: `image-${i}`, title: `Image ${i}`, src: `http://127.0.0.1:5197/quality-image/${i}.png`, srcUrl: `http://127.0.0.1:5197/quality-image/${i}.png` }));
    document.windows.push(about, gallery);
    if (profiles) { const ig = makeWindow('instagram', 2); ig.id = 'ig'; document.windows.push(ig); }
    if (name === 'heavy') for (let i = 3; i < 10; i++) { const links = makeWindow('links', i); links.id = `links-${i}`; document.windows.push(links); }
  }
  const result = migrateSiteDocumentV2(document, { siteId: `fixture-${name}` });
  if (!result.ok || result.version !== 2) throw new Error('Invalid quality fixture');
  let v2 = result.document;
  for (let i = 1; i < profiles; i++) {
    const next = duplicateProfile(v2, v2.entities.profiles[0].id, { siteId: `fixture-${name}`, id: `profile-${i}`, handle: `fixture${i}` });
    if (!next.ok) throw new Error('Invalid profile'); v2 = next.document;
  }
  for (const p of v2.entities.profiles) p.visibility = 'published';
  return v2;
}
const generatedFixtures = { empty: fixture('empty', 0, 0), normal: fixture('normal', 6, 1), heavy: fixture('heavy', 30, 8) };
const ids = new Map<string, string>();
export const fixtures = JSON.parse(JSON.stringify(generatedFixtures).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (id) => { if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`); return ids.get(id)!; }));
mkdirSync('tests/tmp', { recursive: true });
writeFileSync('tests/tmp/quality-fixtures.json', JSON.stringify(fixtures));
// Deterministic RGB PNG: 1024x768, no external source or rights-dependent asset.
const crc = (data: Buffer) => { let c = 0xffffffff; for (const b of data) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
const chunk = (kind: string, data: Buffer) => { const type = Buffer.from(kind); const n = Buffer.alloc(4); n.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([type, data]))); return Buffer.concat([n, type, data, sum]); };
const header = Buffer.alloc(13); header.writeUInt32BE(1024); header.writeUInt32BE(768, 4); header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc(768 * (1024 * 3 + 1));
for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) { const o = y * 3073 + 1 + x * 3; pixels[o] = x % 256; pixels[o + 1] = y % 256; pixels[o + 2] = (x * 17 + y * 13) % 256; }
writeFileSync('tests/tmp/quality-image.png', Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
