// Kleine Promise-Hülle um IndexedDB.

const DB_NAME = 'beer-tracker';
const DB_VERSION = 1;
export const STORES = ['beers', 'crates', 'consumptions', 'tastings', 'meta'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
  });
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
  return value;
}

export async function del(store, id) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await done(tx);
}

/** Mehrere Änderungen atomar: ops = [{store, put?: value, del?: id}] */
export async function batch(ops) {
  const db = await open();
  const names = [...new Set(ops.map((o) => o.store))];
  if (!names.length) return;
  const tx = db.transaction(names, 'readwrite');
  for (const o of ops) {
    const s = tx.objectStore(o.store);
    if (o.del !== undefined) s.delete(o.del);
    else s.put(o.put);
  }
  await done(tx);
}

export async function loadAll() {
  const [beers, crates, consumptions, tastings, meta] = await Promise.all(STORES.map(getAll));
  return { beers, crates, consumptions, tastings, meta: Object.fromEntries(meta.map((m) => [m.key, m.value])) };
}

/** Ersetzt den gesamten Datenbestand (Import). */
export async function replaceAll(data) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  for (const name of ['beers', 'crates', 'consumptions', 'tastings']) {
    for (const v of data[name] || []) tx.objectStore(name).put(v);
  }
  for (const [key, value] of Object.entries(data.meta || {})) tx.objectStore('meta').put({ key, value });
  await done(tx);
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
