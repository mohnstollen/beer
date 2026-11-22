// Reine Sync-Logik (ohne Netz/DOM): Zusammenführen zweier Datenstände.
//
// Datenform „Snapshot“:
// { stores: { beers: [...], crates: [...], consumptions: [...], tastings: [...] },
//   tombstones: [{ store, id, ts }],                // gelöschte Einträge
//   settings: { tags: { value, ts }, ... },          // synchronisierte Einstellungen
//   photoRefs: ['ref', ...] }                        // auf dem Server vorhandene Fotos (nur remote)
//
// Regeln: pro Eintrag gewinnt der neuere Stand (updatedAt, sonst createdAt). Bei Gleichstand gewinnt lokal.
// Eine Löschung gewinnt, wenn sie nicht älter ist als die letzte Änderung des Eintrags.
// Foto-Blobs werden nie zusammengeführt: Einträge tragen nur `photoRef`, die Blobs verwaltet die App.

export const SYNC_STORES = ['beers', 'crates', 'consumptions', 'tastings'];
export const SYNCED_SETTINGS = ['tags', 'alertSettings', 'dismissedAlerts'];
export const SYNC_FORMAT = 1;
const TOMBSTONE_MAX_AGE_DAYS = 400;

export function recordTs(r) {
  return r?.updatedAt || r?.createdAt || '';
}

/** Eintrag ohne Foto-Blob (für Server und Vergleich). */
export function stripPhoto(r) {
  if (!r || !('photo' in r)) return r;
  const { photo, ...rest } = r;
  return rest;
}

export function emptySnapshot() {
  return { stores: Object.fromEntries(SYNC_STORES.map((s) => [s, []])), tombstones: [], settings: {}, photoRefs: [] };
}

function normalize(snap) {
  const base = emptySnapshot();
  if (!snap) return base;
  for (const s of SYNC_STORES) base.stores[s] = (snap.stores?.[s] || []).map(stripPhoto);
  base.tombstones = snap.tombstones || [];
  base.settings = snap.settings || {};
  base.photoRefs = snap.photoRefs || [];
  return base;
}

export function mergeTombstones(a = [], b = [], now = new Date()) {
  const m = new Map();
  for (const t of [...a, ...b]) {
    const k = `${t.store}:${t.id}`;
    if (!m.has(k) || m.get(k).ts < t.ts) m.set(k, t);
  }
  const cutoff = new Date(now.getTime() - TOMBSTONE_MAX_AGE_DAYS * 86400000).toISOString();
  return [...m.values()].filter((t) => t.ts >= cutoff).sort((x, y) => (x.store + x.id < y.store + y.id ? -1 : 1));
}

/**
 * Führt lokalen und entfernten Stand zusammen.
 * Rückgabe: { merged, localChanged, remoteChanged }
 */
export function mergeSnapshots(localSnap, remoteSnap, now = new Date()) {
  const local = normalize(localSnap);
  const remote = normalize(remoteSnap);
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones, now);
  const dead = new Map(tombstones.map((t) => [`${t.store}:${t.id}`, t.ts]));
  const merged = emptySnapshot();
  merged.tombstones = tombstones;

  for (const store of SYNC_STORES) {
    const byId = new Map();
    for (const r of local.stores[store]) byId.set(r.id, r);
    for (const r of remote.stores[store]) {
      const cur = byId.get(r.id);
      if (!cur || recordTs(r) > recordTs(cur)) byId.set(r.id, r);
    }
    merged.stores[store] = [...byId.values()]
      .filter((r) => {
        const ts = dead.get(`${store}:${r.id}`);
        return !ts || ts < recordTs(r);
      })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  const keys = new Set([...Object.keys(local.settings), ...Object.keys(remote.settings)]);
  for (const k of keys) {
    const l = local.settings[k];
    const r = remote.settings[k];
    merged.settings[k] = !l ? r : !r ? l : (r.ts > l.ts ? r : l);
  }
  merged.photoRefs = remote.photoRefs;

  return {
    merged,
    localChanged: fingerprint(merged) !== fingerprint(local),
    remoteChanged: fingerprint(merged) !== fingerprint(remote),
  };
}

/** Stabiler Vergleichswert eines Snapshots (ohne photoRefs). */
export function fingerprint(snap) {
  const n = normalize(snap);
  const sortById = (arr) => [...arr].sort((a, b) => (a.id < b.id ? -1 : 1));
  const stableStringify = (v) => {
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
    return JSON.stringify(v ?? null);
  };
  return stableStringify({
    stores: Object.fromEntries(SYNC_STORES.map((s) => [s, sortById(n.stores[s])])),
    tombstones: n.tombstones.map((t) => `${t.store}:${t.id}:${t.ts}`).sort(),
    settings: n.settings,
  });
}

/** WebDAV-Ordner-URL aus den Einstellungen. Nextcloud-Basis-URL oder direkte WebDAV-URL. */
export function folderUrl({ server, user, folder = 'BeerTracker' }) {
  let base = String(server || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  if (/\/remote\.php\//.test(base)) return `${base}/`;
  const dir = String(folder || 'BeerTracker').trim().replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/');
  return `${base}/remote.php/dav/files/${encodeURIComponent(user)}/${dir}/`;
}
