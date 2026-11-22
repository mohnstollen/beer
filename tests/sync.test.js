import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSnapshots, folderUrl, emptySnapshot, fingerprint } from '../js/sync-core.js';

const snap = (over = {}) => ({ ...emptySnapshot(), ...over, stores: { ...emptySnapshot().stores, ...(over.stores || {}) } });
const NOW = new Date('2026-11-22T12:00:00Z');

test('Vereinigung ohne Konflikte', () => {
  const local = snap({ stores: { beers: [{ id: 'a', name: 'A', createdAt: '2026-11-01T00:00:00Z' }] } });
  const remote = snap({ stores: { beers: [{ id: 'b', name: 'B', createdAt: '2026-11-02T00:00:00Z' }] } });
  const r = mergeSnapshots(local, remote, NOW);
  assert.deepEqual(r.merged.stores.beers.map((x) => x.id), ['a', 'b']);
  assert.equal(r.localChanged, true);
  assert.equal(r.remoteChanged, true);
});

test('Neuere Änderung gewinnt, bei Gleichstand lokal', () => {
  const l = { id: 'a', name: 'lokal', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z' };
  const r = { id: 'a', name: 'remote', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' };
  assert.equal(mergeSnapshots(snap({ stores: { beers: [l] } }), snap({ stores: { beers: [r] } }), NOW).merged.stores.beers[0].name, 'remote');
  assert.equal(mergeSnapshots(snap({ stores: { beers: [r] } }), snap({ stores: { beers: [l] } }), NOW).merged.stores.beers[0].name, 'remote');
  const same = { ...r, name: 'lokal gleich' };
  assert.equal(mergeSnapshots(snap({ stores: { beers: [same] } }), snap({ stores: { beers: [r] } }), NOW).merged.stores.beers[0].name, 'lokal gleich');
});

test('Löschung wird übertragen, spätere Änderung überlebt eine ältere Löschung', () => {
  const rec = { id: 'k1', qty: 1, createdAt: '2026-11-01T00:00:00Z' };
  const del = { store: 'consumptions', id: 'k1', ts: '2026-11-03T00:00:00Z' };
  // Gerät A hat gelöscht, Gerät B hat den Eintrag noch → bleibt gelöscht
  let r = mergeSnapshots(snap({ tombstones: [del] }), snap({ stores: { consumptions: [rec] } }), NOW);
  assert.equal(r.merged.stores.consumptions.length, 0);
  assert.equal(r.merged.tombstones.length, 1);
  // B hat nach der Löschung bearbeitet → Eintrag bleibt
  const edited = { ...rec, qty: 2, updatedAt: '2026-11-04T00:00:00Z' };
  r = mergeSnapshots(snap({ tombstones: [del] }), snap({ stores: { consumptions: [edited] } }), NOW);
  assert.equal(r.merged.stores.consumptions[0].qty, 2);
});

test('Alte Löschmarken werden aufgeräumt', () => {
  const old = { store: 'beers', id: 'x', ts: '2024-01-01T00:00:00Z' };
  assert.equal(mergeSnapshots(snap({ tombstones: [old] }), snap(), NOW).merged.tombstones.length, 0);
});

test('Einstellungen: neuere gewinnt', () => {
  const l = snap({ settings: { tags: { value: ['a'], ts: '2026-11-01T00:00:00Z' }, alertSettings: { value: { lowThreshold: 5 }, ts: '2026-11-09T00:00:00Z' } } });
  const r = snap({ settings: { tags: { value: ['b'], ts: '2026-11-02T00:00:00Z' } } });
  const m = mergeSnapshots(l, r, NOW).merged.settings;
  assert.deepEqual(m.tags.value, ['b']);
  assert.equal(m.alertSettings.value.lowThreshold, 5);
});

test('Foto-Blobs werden nie übertragen, Gleichstand erkannt', () => {
  const withBlob = { id: 't', photo: { fake: 'blob' }, photoRef: 'p1', createdAt: '2026-11-01T00:00:00Z' };
  const without = { id: 't', photoRef: 'p1', createdAt: '2026-11-01T00:00:00Z' };
  const r = mergeSnapshots(snap({ stores: { tastings: [withBlob] } }), snap({ stores: { tastings: [without] } }), NOW);
  assert.equal('photo' in r.merged.stores.tastings[0], false);
  assert.equal(r.localChanged, false);
  assert.equal(r.remoteChanged, false);
  assert.equal(fingerprint(snap({ stores: { tastings: [withBlob] } })), fingerprint(snap({ stores: { tastings: [without] } })));
});

test('WebDAV-Ordner aus Nextcloud-Angaben', () => {
  assert.equal(folderUrl({ server: 'cloud.example.org/', user: 'max m', folder: 'Apps/Beer' }),
    'https://cloud.example.org/remote.php/dav/files/max%20m/Apps/Beer/');
  assert.equal(folderUrl({ server: 'https://x.de/nc/remote.php/dav/files/max/Bier', user: 'max' }),
    'https://x.de/nc/remote.php/dav/files/max/Bier/');
});
