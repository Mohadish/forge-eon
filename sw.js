// answers for the game's files: each is fetched locked and unlocked here, with the key this browser was given by the link
const TYPES = {"html":"text/html; charset=utf-8","js":"text/javascript; charset=utf-8","css":"text/css; charset=utf-8","json":"application/json","webp":"image/webp","png":"image/png","svg":"image/svg+xml"};
const PLAIN = new Set(['', 'index.html', 'gate.js', 'sw.js', 'back.js', 'icon.svg', 'site.webmanifest']);
const BASE = new URL('./', self.location.href), enc = new TextEncoder();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const db = () => new Promise((ok, no) => {
  const r = indexedDB.open('forge-eon-key', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('k');
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
async function stored(put) {
  const d = await db();
  try {
    return await new Promise((ok, no) => {
      const t = d.transaction('k', put ? 'readwrite' : 'readonly'), s = t.objectStore('k'), r = put ? s.put(put, 'keys') : s.get('keys');
      t.oncomplete = () => ok(put || r.result || null); t.onerror = t.onabort = () => no(t.error);
    });
  } finally { d.close(); }
}
let kept = null;
const keys = async () => kept || (kept = await stored());

async function derive(text) {                                                  // kept as keys that cannot be read back out
  const raw = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
  const root = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const from = info => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('forge-eon/v1'), info: enc.encode(info) });
  return {
    enc: await crypto.subtle.deriveKey(from('enc'), root, { name: 'AES-GCM', length: 256 }, false, ['decrypt']),
    name: await crypto.subtle.deriveKey(from('name'), root, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  };
}
async function open(K, rel) {                                                  // { body } or { status }
  const id = [...new Uint8Array(await crypto.subtle.sign('HMAC', K.name, enc.encode(rel)))].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  let r;
  try { r = await fetch(new URL('d/' + id + '.bin', BASE), { cache: 'no-cache' }); } catch (e) { return { status: 503 }; }
  if (!r.ok) return { status: r.status === 404 ? 404 : 503 };
  const b = new Uint8Array(await r.arrayBuffer());
  let p;
  try { p = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), additionalData: enc.encode(rel) }, K.enc, b.slice(12))); } catch (e) { return { status: 403 }; }
  const body = p.slice(1);
  return { body: p[0] === 1 ? await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : body };
}

async function handshake(given) {
  const K = given ? await derive(given) : await keys();
  if (!K) return 'none';
  const got = await open(K, '.check');
  if (!got.body) return got.status === 503 ? 'offline' : 'wrong';              // a wrong key never replaces the one that works
  if (given) { await stored(K); kept = K; }
  return 'ok';
}
self.addEventListener('message', e => {
  const port = e.ports[0]; if (!port) return;
  const given = e.data && e.data.key;
  e.waitUntil(handshake(given).catch(() => given ? 'wrong' : 'none').then(said => port.postMessage(said)));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== BASE.origin || !u.pathname.startsWith(BASE.pathname)) return;
  let rel = u.pathname.slice(BASE.pathname.length);
  try { rel = decodeURIComponent(rel); } catch (x) { return; }
  if (PLAIN.has(rel) || rel.startsWith('d/')) return;
  e.respondWith((async () => {
    const K = await keys();
    if (!K) return e.request.mode === 'navigate' ? Response.redirect(BASE.href) : new Response('', { status: 403 });
    const got = await open(K, rel);
    if (!got.body) return new Response(got.status === 503 ? 'No connection to the game: check the internet and reload.' : '', { status: got.status });
    return new Response(got.body, { headers: { 'content-type': TYPES[rel.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' } });
  })());
});
