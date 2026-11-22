// WebDAV-Client für die Synchronisation (Nextcloud oder jeder WebDAV-Server mit CORS).
import { folderUrl } from './sync-core.js';
import { useNativeHttp, nativeFetch } from './native.js';

export const DATA_FILE = 'beer-sync.json';
export const PHOTO_DIR = 'fotos/';

export class SyncError extends Error {
  constructor(message, kind = 'other') { super(message); this.kind = kind; }
}

export function createClient(config) {
  const base = folderUrl(config);
  const auth = 'Basic ' + btoa(unescape(encodeURIComponent(`${config.user}:${config.password}`)));
  // In der Android-App laufen Anfragen nativ (keine CORS-Grenzen), im Browser über fetch
  const doFetch = (url, opts) => (useNativeHttp()
    ? nativeFetch(url, opts)
    : fetch(url, { ...opts, credentials: 'omit', cache: 'no-store' }));

  async function request(method, path, { body, headers = {}, okStatus = [] } = {}) {
    let res;
    try {
      res = await doFetch(base + path, { method, body, headers: { Authorization: auth, ...headers } });
    } catch {
      throw new SyncError(navigator.onLine === false
        ? 'Offline – Synchronisation folgt, sobald wieder Netz da ist.'
        : 'Server nicht erreichbar. Adresse prüfen – und ob der Server Zugriffe von dieser App erlaubt (CORS, siehe Anleitung).', 'network');
    }
    if (res.status === 401) throw new SyncError('Anmeldung fehlgeschlagen – Benutzername oder App-Passwort prüfen.', 'auth');
    if (res.status === 403) throw new SyncError('Zugriff verweigert (403).', 'auth');
    if (!res.ok && !okStatus.includes(res.status)) throw new SyncError(`Server-Fehler ${res.status} bei ${method} ${path || '/'}`, 'server');
    return res;
  }

  async function ensureDir(path) {
    // 201 = angelegt, 405 = existiert schon
    const res = await request('MKCOL', path, { okStatus: [405] });
    return res.status;
  }

  return {
    base,
    async ensureFolders() {
      // Elternordner einzeln anlegen (z. B. „Apps/Beer“)
      const url = new URL(base);
      const marker = url.pathname.match(/^(.*\/remote\.php\/dav\/files\/[^/]+\/)(.*)$/);
      if (marker && marker[2].split('/').filter(Boolean).length > 1) {
        const parts = marker[2].split('/').filter(Boolean);
        let p = url.origin + marker[1];
        for (const part of parts.slice(0, -1)) {
          p += part + '/';
          try { await doFetch(p, { method: 'MKCOL', headers: { Authorization: auth } }); } catch { /* egal */ }
        }
      }
      await ensureDir('');
      await ensureDir(PHOTO_DIR);
    },
    async getData() {
      const res = await request('GET', DATA_FILE, { okStatus: [404] });
      if (res.status === 404) return null;
      try { return await res.json(); } catch { throw new SyncError('Die Sync-Datei auf dem Server ist beschädigt.', 'server'); }
    },
    async putData(obj) {
      await request('PUT', DATA_FILE, { body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } });
    },
    async putPhoto(ref, blob) {
      await request('PUT', `${PHOTO_DIR}${encodeURIComponent(ref)}.jpg`, { body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } });
    },
    async getPhoto(ref) {
      const res = await request('GET', `${PHOTO_DIR}${encodeURIComponent(ref)}.jpg`, { okStatus: [404] });
      return res.status === 404 ? null : res.blob();
    },
  };
}
