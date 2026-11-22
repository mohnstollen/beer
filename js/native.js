// Brücke zur Android-App (Capacitor). Im Browser ist window.Capacitor nicht vorhanden → alles fällt auf Web-Wege zurück.

const cap = () => globalThis.Capacitor;

export function isNative() {
  return !!cap()?.isNativePlatform?.();
}

const plugins = new Map();
export function plugin(name) {
  if (!isNative()) return null;
  if (!plugins.has(name)) plugins.set(name, cap().registerPlugin(name));
  return plugins.get(name);
}

export function hasPlugin(name) {
  return isNative() && !!cap().isPluginAvailable?.(name);
}

// ---------- WebDAV nativ (ohne CORS) ----------

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBytes(b64) {
  const s = atob(b64 || '');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** fetch-ähnliche Anfrage über das native WebDavPlugin. Liefert ein Response-Objekt. */
export async function nativeFetch(url, { method = 'GET', headers = {}, body } = {}) {
  let bodyBase64 = null;
  if (body != null) {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(await body.arrayBuffer());
    bodyBase64 = bytesToBase64(bytes);
  }
  const res = await plugin('WebDav').request({ url, method, headers, bodyBase64 });
  return new Response(res.status === 204 || res.status === 304 || method === 'MKCOL' ? null : base64ToBytes(res.bodyBase64), {
    status: res.status,
    headers: res.headers || {},
  });
}

export function useNativeHttp() {
  return hasPlugin('WebDav');
}

// ---------- Barcode (ML Kit / Google Code Scanner) ----------

/** Liefert den Code, null bei Abbruch, oder wirft, wenn der native Scanner nicht verfügbar ist. */
export async function nativeScan() {
  const scanner = plugin('BarcodeScanner');
  const { available } = await scanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await scanner.installGoogleBarcodeScannerModule();
    throw new Error('Scanner-Modul wird von Google Play installiert – bitte gleich noch einmal versuchen.');
  }
  try {
    const { barcodes } = await scanner.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] });
    return barcodes?.[0]?.rawValue || null;
  } catch (err) {
    if (/cancel/i.test(err?.message || '')) return null;
    throw err;
  }
}

// ---------- Datei teilen (Export) ----------

export async function shareFile(filename, blob) {
  const text = await blob.text();
  const { uri } = await plugin('Filesystem').writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
  await plugin('Share').share({ title: filename, files: [uri], dialogTitle: 'Backup speichern oder senden' });
}

// ---------- Zurück-Taste ----------

export function onBackButton(handler) {
  plugin('App')?.addListener('backButton', handler);
}

export function exitApp() {
  plugin('App')?.exitApp();
}
