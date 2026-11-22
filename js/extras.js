// Funktionen, die Netz oder Gerätesensoren brauchen: Barcode-Scan, Open Food Facts, Karte, GPS.
import { h, clear, openSheet, closeSheet } from './ui.js';

const ZXING_URL = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.crossOrigin = 'anonymous';
      el.onload = resolve;
      el.onerror = () => { loaded.delete(src); reject(new Error('Bibliothek konnte nicht geladen werden (offline?)')); };
      document.head.append(el);
    }));
  }
  return loaded.get(src);
}

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href, crossorigin: 'anonymous' }));
}

// ---------- Barcode-Scan ----------

export function isValidEan(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Öffnet die Kamera und liefert den ersten erkannten EAN-Code (oder eine manuelle Eingabe).
 * Nutzt die native BarcodeDetector-API, sonst ZXing (lazy geladen). Promise<string|null>
 */
export function scanBarcode() {
  return new Promise((resolve) => {
    let finished = false;
    let stream = null;
    let timer = null;
    let zxingReader = null;
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
    const status = h('p', { class: 'muted center' }, 'Kamera wird gestartet …');
    const manual = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'EAN manuell eingeben', autocomplete: 'off' });

    const stop = () => {
      clearInterval(timer);
      try { zxingReader?.reset(); } catch { /* egal */ }
      stream?.getTracks().forEach((t) => t.stop());
    };
    const finish = (code) => {
      if (finished) return;
      finished = true;
      stop();
      navigator.vibrate?.(60);
      closeSheet(sheet);
      resolve(code);
    };

    const sheet = openSheet({
      title: 'Barcode scannen',
      saveLabel: 'Übernehmen',
      body: [
        h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-line' })),
        status,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Oder Nummer eintippen'), manual),
      ],
      onSave: () => {
        const code = manual.value.replace(/\D/g, '');
        if (!code) return false;
        finish(code);
        return false; // finish schließt selbst
      },
      onClose: () => { if (!finished) { finished = true; stop(); resolve(null); } },
    });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera verfügbar.');
        const constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
        const hasNative = 'BarcodeDetector' in window
          && (await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || []).includes('ean_13');
        if (hasNative) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (finished) return stop();
          video.srcObject = stream;
          await video.play().catch(() => {});
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          status.textContent = 'Barcode in den Rahmen halten';
          timer = setInterval(async () => {
            if (finished || video.readyState < 2) return;
            try {
              const codes = await detector.detect(video);
              const hit = codes.find((c) => isValidEan(c.rawValue));
              if (hit) finish(hit.rawValue);
            } catch { /* nächster Versuch */ }
          }, 200);
        } else {
          status.textContent = 'Scanner wird geladen …';
          await loadScript(ZXING_URL);
          if (finished) return;
          const hints = new Map([[window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
            window.ZXing.BarcodeFormat.EAN_13, window.ZXing.BarcodeFormat.EAN_8, window.ZXing.BarcodeFormat.UPC_A,
          ]]]);
          zxingReader = new window.ZXing.BrowserMultiFormatReader(hints, 250);
          status.textContent = 'Barcode in den Rahmen halten';
          await zxingReader.decodeFromConstraints(constraints, video, (result) => {
            if (result && isValidEan(result.getText())) finish(result.getText());
          });
        }
      } catch (err) {
        status.textContent = `${err.name === 'NotAllowedError' ? 'Kamera-Zugriff verweigert.' : err.message || 'Kamera nicht verfügbar.'} Nummer unten eintippen.`;
      }
    })();
  });
}

/**
 * Produktdaten aus Open Food Facts. Liefert {name, brewery, abv, quantityMl} oder null.
 * Wirft bei Netzwerkfehlern.
 */
export async function lookupOpenFoodFacts(ean) {
  const fields = 'product_name,product_name_de,brands,nutriments,quantity,categories_tags';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${fields}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts antwortet mit ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  return parseOffProduct(data.product);
}

export function parseOffProduct(p) {
  const n = p.nutriments || {};
  const abvRaw = n.alcohol_value ?? n.alcohol ?? n.alcohol_100g;
  const abv = abvRaw != null && abvRaw !== '' && Number.isFinite(Number(abvRaw)) ? Number(abvRaw) : null;
  let quantityMl = null;
  const q = String(p.quantity || '').toLowerCase().replace(',', '.');
  const m = q.match(/([\d.]+)\s*(ml|cl|l)\b/);
  if (m) quantityMl = Math.round(Number(m[1]) * (m[2] === 'l' ? 1000 : m[2] === 'cl' ? 10 : 1));
  const name = (p.product_name_de || p.product_name || '').trim();
  const brewery = String(p.brands || '').split(',')[0].trim();
  return { name, brewery, abv, quantityMl };
}

// ---------- Standort ----------

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Standort wird nicht unterstützt.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Standort-Zugriff verweigert.' : 'Standort nicht ermittelbar.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

export function osmLink(lat, lon) {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=17/${lat.toFixed(5)}/${lon.toFixed(5)}`;
}

// ---------- Karte ----------

/** points = [{lat, lon, title, sub, onClick}] */
export function openMapSheet(title, points) {
  const el = h('div', { class: 'map' });
  const status = h('p', { class: 'muted small center' }, 'Karte wird geladen …');
  let map = null;
  openSheet({ title, body: [el, status], onClose: () => map?.remove() });
  (async () => {
    try {
      loadCss(LEAFLET_CSS);
      await loadScript(LEAFLET_JS);
      const L = window.L;
      map = L.map(el, { zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const markers = points.map((p) => {
        const popup = h('div', null, h('strong', null, p.title), p.sub ? h('div', null, p.sub) : null,
          p.onClick ? h('button', { type: 'button', class: 'link', onclick: p.onClick }, 'Details') : null);
        return L.circleMarker([p.lat, p.lon], { radius: 9, color: '#ffffff', weight: 2, fillColor: '#b86a00', fillOpacity: 1 })
          .bindPopup(popup).addTo(map);
      });
      if (markers.length === 1) map.setView([points[0].lat, points[0].lon], 15);
      else map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
      setTimeout(() => map.invalidateSize(), 250);
      status.textContent = `${points.length} ${points.length === 1 ? 'Ort' : 'Orte'} mit Standort`;
    } catch (err) {
      clear(el);
      status.textContent = err.message;
    }
  })();
}
