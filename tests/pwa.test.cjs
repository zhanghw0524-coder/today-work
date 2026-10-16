const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const swCode = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
function worker() {
  const events = {}, added = [], removed = [];
  const prefix = 'today-work:/today-work/:';
  const cache = { addAll: async urls => added.push(...urls), match: async url => ({ cached: url }) };
  const currentVersion = swCode.match(/const CACHE_VERSION = '([^']+)'/)[1];
  const context = vm.createContext({ URL, Set, self: { location: { href: 'https://example.test/today-work/service-worker.js' }, clients: { claim: async () => {} }, addEventListener: (type, handler) => { events[type] = handler; } }, caches: { open: async () => cache, keys: async () => [prefix + 'v1', prefix + currentVersion, 'other-app-v1'], delete: async name => removed.push(name) }, fetch: async request => ({ network: request.url }) });
  vm.runInContext(swCode, context);
  return { events, added, removed };
}
test('manifest has installable standalone metadata and valid any/maskable PNG icons', () => {
  assert.equal(manifest.name, 'Today Work'); assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    const bytes = fs.readFileSync(path.join(root, icon.src));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(bytes.readUInt32BE(16), width); assert.equal(bytes.readUInt32BE(20), height);
  }
  for (const size of ['192x192', '512x512']) for (const purpose of ['any', 'maskable']) assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === purpose));
});
test('precache resolves all shell files under a GitHub Pages-style subpath', async () => {
  const { events, added } = worker(); let promise;
  events.install({ waitUntil: value => { promise = value; } }); await promise;
  assert.ok(added.length >= 17);
  for (const href of added) {
    const url = new URL(href); assert.ok(url.pathname.startsWith('/today-work/'));
    const file = url.pathname.slice('/today-work/'.length) || 'index.html'; assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.ok(!/backup|test-artifacts|tests\//.test(file));
  }
});
test('cache upgrade deletes only obsolete caches owned by this application scope', async () => {
  const { events, removed } = worker(); let promise;
  events.activate({ waitUntil: value => { promise = value; } }); await promise;
  assert.equal(removed.join(','), 'today-work:/today-work/:v1');
  assert.ok(!swCode.includes('skipWaiting('));
});
test('offline navigation with a query uses cached HTML; outside-origin/data traffic is untouched', async () => {
  const { events } = worker(); let promise;
  events.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/today-work/?offline=1' }, respondWith: value => { promise = value; } });
  assert.equal((await promise).cached, 'https://example.test/today-work/index.html');
  for (const request of [{ method: 'POST', mode: 'cors', url: 'https://example.test/today-work/' }, { method: 'GET', mode: 'cors', url: 'https://other.test/data.json' }, { method: 'GET', mode: 'cors', url: 'https://example.test/today-work/backup.json' }]) {
    let intercepted = false; events.fetch({ request, respondWith: () => { intercepted = true; } }); assert.equal(intercepted, false);
  }
});
test('all HTML static references stay relative and source scripts parse', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1]; if (value.startsWith('data:') || value.startsWith('#')) continue;
    assert.ok(!value.startsWith('/'), value); assert.ok(fs.existsSync(path.join(root, value)), value);
  }
  for (const file of fs.readdirSync(path.join(root, 'js'))) if (file.endsWith('.js')) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, 'js', file), 'utf8')));
});
