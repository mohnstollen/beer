// Reine Logik ohne DOM/IndexedDB – läuft im Browser und in Node (Tests).

export const DEFAULT_TAGS = ['süffig', 'hopfig', 'malzig', 'mild', 'bitter', 'fruchtig', 'spritzig'];

export const PACKAGINGS = [
  { key: 'k20x05', label: '20×0,5 l', count: 20, unitMl: 500 },
  { key: 'k24x033', label: '24×0,33 l', count: 24, unitMl: 330 },
  { key: 's6x033', label: '6er 0,33 l', count: 6, unitMl: 330 },
  { key: 's6x05', label: '6er 0,5 l', count: 6, unitMl: 500 },
  { key: 'single', label: 'Einzelflasche', count: 1, unitMl: 500 },
  { key: 'keg', label: 'Fass 5 l', count: 10, unitMl: 500 },
];

export const SERVING_SIZES = [
  { label: '0,33', ml: 330 },
  { label: '0,5', ml: 500 },
  { label: 'Maß', ml: 1000 },
];

export const DEFAULT_TASTING_ML = 500;
const ETHANOL_DENSITY = 0.789; // g/ml

export function packagingByKey(key) {
  return PACKAGINGS.find((p) => p.key === key) || null;
}

// ---------- Datum ----------

export function toDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

export function monthKey(d) {
  return toDateKey(d).slice(0, 7);
}

/** Montag der Woche (lokal) als YYYY-MM-DD */
export function weekKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const wd = (x.getDay() + 6) % 7; // Mo=0
  x.setDate(x.getDate() - wd);
  return toDateKey(x);
}

/** Wochentag 0=Mo … 6=So */
export function weekdayIndex(d) {
  return (new Date(d).getDay() + 6) % 7;
}

/** 'YYYY-MM-DD' als lokales Datum (nicht UTC) interpretieren. */
export function parseDate(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
  return new Date(v);
}

export function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  da.setHours(0, 0, 0, 0);
  db.setHours(0, 0, 0, 0);
  return Math.round((db - da) / 86400000);
}

// ---------- Sorten ----------

export function isAlcoholFree(beer) {
  return !!beer && (beer.alcoholFree || beer.abv === 0);
}

export function effectiveAbv(beer) {
  if (!beer || isAlcoholFree(beer)) return 0;
  return typeof beer.abv === 'number' ? beer.abv : null;
}

/** Wurzel-Sorte für gemeinsame Auswertung von Varianten. */
export function rootBeerId(beerId, beersById) {
  const b = beersById.get(beerId);
  return b && b.variantOf && beersById.has(b.variantOf) ? b.variantOf : beerId;
}

export function alcoholGrams(ml, abv) {
  if (!abv) return 0;
  return ml * (abv / 100) * ETHANOL_DENSITY;
}

// ---------- Kästen ----------

/** Getrunkene Flaschen aus einem Kasten (Konsum + verknüpfte Tastings). */
export function crateUsed(crate, consumptions, tastings) {
  let used = 0;
  for (const c of consumptions) if (c.crateId === crate.id) used += c.qty;
  for (const t of tastings) if (t.crateId === crate.id) used += 1;
  return used;
}

export function crateRemaining(crate, consumptions, tastings) {
  return Math.max(0, crate.count - crateUsed(crate, consumptions, tastings));
}

/** Zeitpunkt, an dem der Kasten leer wurde – oder null, wenn noch offen. */
export function crateEmptiedAt(crate, consumptions, tastings) {
  const events = [
    ...consumptions.filter((c) => c.crateId === crate.id).map((c) => ({ ts: c.ts, n: c.qty })),
    ...tastings.filter((t) => t.crateId === crate.id).map((t) => ({ ts: t.ts, n: 1 })),
  ].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  let sum = 0;
  for (const e of events) {
    sum += e.n;
    if (sum >= crate.count) return e.ts;
  }
  return null;
}

export function crateDurationDays(crate, consumptions, tastings) {
  const end = crateEmptiedAt(crate, consumptions, tastings);
  if (!end) return null;
  return daysBetween(crate.purchaseDate, end);
}

export function cratePricePerBottle(crate) {
  if (crate.price == null || !crate.count) return null;
  return crate.price / crate.count;
}

export function cratePricePerLiter(crate) {
  if (crate.price == null || !crate.count || !crate.unitMl) return null;
  return crate.price / ((crate.count * crate.unitMl) / 1000);
}

/** Offene Kästen mit Rest, sortiert: zuletzt genutzt bzw. gekauft zuerst. */
export function openCrates(state) {
  const { crates, consumptions, tastings } = state;
  const lastUse = new Map();
  for (const c of consumptions) {
    if (!lastUse.has(c.crateId) || lastUse.get(c.crateId) < c.ts) lastUse.set(c.crateId, c.ts);
  }
  return crates
    .map((crate) => ({ crate, remaining: crateRemaining(crate, consumptions, tastings) }))
    .filter((x) => x.remaining > 0)
    .sort((a, b) => {
      const ka = lastUse.get(a.crate.id) || a.crate.purchaseDate;
      const kb = lastUse.get(b.crate.id) || b.crate.purchaseDate;
      return ka < kb ? 1 : ka > kb ? -1 : 0;
    });
}

// ---------- Trink-Ereignisse (vereinheitlicht) ----------

/**
 * Jeder Konsum-Eintrag und jedes Tasting wird zu einem Ereignis.
 * { id, kind: 'consumption'|'tasting', ts, beerId, bottles, ml, abv, alcoholFree, ref }
 */
export function drinkEvents(state) {
  const beersById = new Map(state.beers.map((b) => [b.id, b]));
  const cratesById = new Map(state.crates.map((c) => [c.id, c]));
  const out = [];
  for (const c of state.consumptions) {
    const crate = cratesById.get(c.crateId);
    if (!crate) continue;
    const beer = beersById.get(crate.beerId);
    out.push({
      id: c.id, kind: 'consumption', ts: c.ts, beerId: crate.beerId,
      bottles: c.qty, ml: c.ml ?? c.qty * crate.unitMl,
      abv: effectiveAbv(beer), alcoholFree: isAlcoholFree(beer), ref: c,
    });
  }
  for (const t of state.tastings) {
    const beer = beersById.get(t.beerId);
    const crate = t.crateId ? cratesById.get(t.crateId) : null;
    out.push({
      id: t.id, kind: 'tasting', ts: t.ts, beerId: t.beerId,
      bottles: 1, ml: t.ml ?? crate?.unitMl ?? DEFAULT_TASTING_ML,
      abv: effectiveAbv(beer), alcoholFree: isAlcoholFree(beer), ref: t,
    });
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

export function filterEvents(events, { from = null, to = null, alc = 'all' } = {}) {
  return events.filter((e) => {
    if (from && e.ts < from) return false;
    if (to && e.ts >= to) return false;
    if (alc === 'alc' && e.alcoholFree) return false;
    if (alc === 'af' && !e.alcoholFree) return false;
    return true;
  });
}

// ---------- Statistik ----------

export function sumEvents(events) {
  let bottles = 0, ml = 0, grams = 0;
  for (const e of events) {
    bottles += e.bottles;
    ml += e.ml;
    grams += alcoholGrams(e.ml, e.abv);
  }
  return { bottles, ml, grams };
}

/** Gruppiert nach Schlüsselfunktion, liefert sortierte [{key, bottles, ml}] */
export function bucketEvents(events, keyFn) {
  const m = new Map();
  for (const e of events) {
    const k = keyFn(e.ts);
    const cur = m.get(k) || { key: k, bottles: 0, ml: 0 };
    cur.bottles += e.bottles;
    cur.ml += e.ml;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Lückenlose Wochen-Buckets der letzten n Wochen bis `now`. */
export function lastWeeks(events, n, now = new Date()) {
  const keys = [];
  const d = new Date(weekKey(now) + 'T00:00:00');
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(x.getDate() - i * 7);
    keys.push(toDateKey(x));
  }
  const m = new Map(bucketEvents(events, weekKey).map((b) => [b.key, b]));
  return keys.map((k) => m.get(k) || { key: k, bottles: 0, ml: 0 });
}

/** Lückenlose Monats-Buckets der letzten n Monate bis `now`. */
export function lastMonths(events, n, now = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(x));
  }
  const m = new Map(bucketEvents(events, monthKey).map((b) => [b.key, b]));
  return keys.map((k) => m.get(k) || { key: k, bottles: 0, ml: 0 });
}

export function weekdayDistribution(events) {
  const arr = Array.from({ length: 7 }, (_, i) => ({ key: i, bottles: 0, ml: 0 }));
  for (const e of events) {
    const w = arr[weekdayIndex(e.ts)];
    w.bottles += e.bottles;
    w.ml += e.ml;
  }
  return arr;
}

/** Ausgaben pro Monat in Cent: Kästen nach Kaufdatum + Tastings mit Preis. */
export function spendingByMonth(state, { from = null, to = null } = {}) {
  const m = new Map();
  const add = (k, cents) => m.set(k, (m.get(k) || 0) + cents);
  for (const c of state.crates) {
    if (c.price == null) continue;
    const ts = new Date(c.purchaseDate + 'T12:00:00').toISOString();
    if (from && ts < from) continue;
    if (to && ts >= to) continue;
    add(c.purchaseDate.slice(0, 7), c.price);
  }
  for (const t of state.tastings) {
    if (t.price == null) continue;
    if (from && t.ts < from) continue;
    if (to && t.ts >= to) continue;
    add(monthKey(t.ts), t.price);
  }
  return m;
}

export function favoritesByRating(state, { groupVariants = false, minCount = 1 } = {}) {
  const beersById = new Map(state.beers.map((b) => [b.id, b]));
  const m = new Map();
  for (const t of state.tastings) {
    if (!t.rating) continue;
    const id = groupVariants ? rootBeerId(t.beerId, beersById) : t.beerId;
    const cur = m.get(id) || { beerId: id, sum: 0, n: 0 };
    cur.sum += t.rating;
    cur.n += 1;
    m.set(id, cur);
  }
  return [...m.values()]
    .filter((x) => x.n >= minCount)
    .map((x) => ({ beerId: x.beerId, avg: x.sum / x.n, n: x.n }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
}

export function favoritesByConsumption(events, beers, { groupVariants = false } = {}) {
  const beersById = new Map(beers.map((b) => [b.id, b]));
  const m = new Map();
  for (const e of events) {
    const id = groupVariants ? rootBeerId(e.beerId, beersById) : e.beerId;
    const cur = m.get(id) || { beerId: id, bottles: 0, ml: 0 };
    cur.bottles += e.bottles;
    cur.ml += e.ml;
    m.set(id, cur);
  }
  return [...m.values()].sort((a, b) => b.bottles - a.bottles || b.ml - a.ml);
}

export function crateSummary(state) {
  const { crates, consumptions, tastings } = state;
  const durations = [];
  let priceSum = 0, bottles = 0, liters = 0;
  for (const c of crates) {
    const d = crateDurationDays(c, consumptions, tastings);
    if (d != null) durations.push(d);
    if (c.price != null && c.count) {
      priceSum += c.price;
      bottles += c.count;
      liters += (c.count * c.unitMl) / 1000;
    }
  }
  return {
    avgDurationDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    emptyCount: durations.length,
    avgPerBottle: bottles ? priceSum / bottles : null,
    avgPerLiter: liters ? priceSum / liters : null,
  };
}

// ---------- Verlauf / Suche ----------

export function searchEvents(events, state, { q = '', kind = 'all', minRating = 0, beerId = null, brewery = null, from = null, to = null } = {}) {
  const beersById = new Map(state.beers.map((b) => [b.id, b]));
  const needle = q.trim().toLowerCase();
  return events.filter((e) => {
    if (kind !== 'all' && e.kind !== kind) return false;
    if (beerId && e.beerId !== beerId) return false;
    const beer = beersById.get(e.beerId);
    if (brewery && (beer?.brewery || '') !== brewery) return false;
    if (minRating && (e.kind !== 'tasting' || (e.ref.rating || 0) < minRating)) return false;
    if (from && e.ts < from) return false;
    if (to && e.ts >= to) return false;
    if (needle) {
      const hay = [beer?.name, beer?.brewery, beer?.style, e.ref.note, e.ref.location, ...(e.ref.tags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** Eindeutige, nach Häufigkeit sortierte Werte (für Vorschläge). */
export function suggestions(values) {
  const m = new Map();
  for (const v of values) {
    const s = (v || '').trim();
    if (!s) continue;
    m.set(s, (m.get(s) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

// ---------- Export ----------

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function eventsToCsv(state) {
  const beersById = new Map(state.beers.map((b) => [b.id, b]));
  const header = ['zeit', 'art', 'sorte', 'brauerei', 'stil', 'alkoholfrei', 'abv', 'flaschen', 'ml', 'note', 'tags', 'notiz', 'ort', 'preis_eur'];
  const rows = drinkEvents(state).slice().reverse().map((e) => {
    const b = beersById.get(e.beerId) || {};
    const t = e.kind === 'tasting' ? e.ref : {};
    return [
      e.ts, e.kind === 'tasting' ? 'tasting' : 'kasten', b.name, b.brewery, b.style,
      e.alcoholFree ? 'ja' : 'nein', e.abv ?? '', e.bottles, e.ml,
      t.rating ?? '', (t.tags || []).join(','), t.note ?? '', t.location ?? '',
      t.price != null ? (t.price / 100).toFixed(2) : '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}

// ---------- Formatierung ----------

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtLiters(ml) {
  return `${nf1.format(ml / 1000)} l`;
}

export function fmtMl(ml) {
  return ml >= 1000 ? fmtLiters(ml) : `${nf2.format(ml / 1000).replace(/0$/, '')} l`;
}

export function fmtEuro(cents) {
  if (cents == null) return '–';
  return `${nf2.format(cents / 100)} €`;
}

export function fmtNumber(n, digits = 1) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(n);
}

export function parseEuro(str) {
  if (str == null) return null;
  const s = String(str).trim().replace('€', '').replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function parseDecimal(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- Hinweise: Nachkauf & MHD ----------

export const DEFAULT_ALERT_SETTINGS = { lowThreshold: 3, mhdDays: 14, emptyDays: 7 };

/**
 * Hinweise für den Startbildschirm.
 * - 'low':     Bestand einer Sorte (über alle offenen Kästen) ≤ Schwelle → Nachkauf
 * - 'empty':   letzter Kasten einer Sorte ist seit ≤ emptyDays leer, kein neuer offen → Nachkauf
 * - 'expired': MHD eines offenen Kastens überschritten
 * - 'mhd':     MHD eines offenen Kastens in ≤ mhdDays Tagen
 * Jeder Hinweis hat eine stabile `key`, damit er weggeklickt werden kann.
 */
export function alerts(state, settings = {}, now = new Date()) {
  const { lowThreshold, mhdDays, emptyDays } = { ...DEFAULT_ALERT_SETTINGS, ...settings };
  const { crates, consumptions, tastings } = state;
  const out = [];
  const byBeer = new Map();
  for (const crate of crates) {
    const remaining = crateRemaining(crate, consumptions, tastings);
    const list = byBeer.get(crate.beerId) || [];
    list.push({ crate, remaining });
    byBeer.set(crate.beerId, list);

    if (remaining > 0 && crate.bestBefore) {
      const days = daysBetween(now, crate.bestBefore);
      if (days < 0) out.push({ type: 'expired', key: `expired:${crate.id}`, crateId: crate.id, beerId: crate.beerId, days, remaining });
      else if (days <= mhdDays) out.push({ type: 'mhd', key: `mhd:${crate.id}`, crateId: crate.id, beerId: crate.beerId, days, remaining });
    }
  }
  for (const [beerId, list] of byBeer) {
    const open = list.filter((x) => x.remaining > 0);
    const total = open.reduce((a, x) => a + x.remaining, 0);
    if (open.length) {
      // Einzelflaschen-Käufe lösen keinen Nachkauf-Hinweis aus
      const bigEnough = open.some((x) => x.crate.count > lowThreshold);
      if (bigEnough && total <= lowThreshold) {
        const newest = open.reduce((a, b) => (a.crate.purchaseDate >= b.crate.purchaseDate ? a : b));
        out.push({ type: 'low', key: `low:${newest.crate.id}`, crateId: newest.crate.id, beerId, remaining: total });
      }
      continue;
    }
    const multi = list.filter((x) => x.crate.count > 1);
    if (!multi.length) continue;
    const last = multi
      .map((x) => ({ ...x, emptiedAt: crateEmptiedAt(x.crate, consumptions, tastings) }))
      .filter((x) => x.emptiedAt)
      .sort((a, b) => (a.emptiedAt < b.emptiedAt ? 1 : -1))[0];
    if (last && daysBetween(last.emptiedAt, now) <= emptyDays) {
      out.push({ type: 'empty', key: `empty:${last.crate.id}`, crateId: last.crate.id, beerId, remaining: 0, emptiedAt: last.emptiedAt });
    }
  }
  const order = { expired: 0, mhd: 1, low: 2, empty: 3 };
  return out.sort((a, b) => order[a.type] - order[b.type] || (a.days ?? 0) - (b.days ?? 0));
}

export function activeAlerts(state, settings = {}, dismissed = [], now = new Date()) {
  const d = new Set(dismissed);
  return alerts(state, settings, now).filter((a) => !d.has(a.key));
}

// ---------- Länder ----------

export const COUNTRIES = [
  ['DE', 'Deutschland'], ['AT', 'Österreich'], ['CH', 'Schweiz'], ['CZ', 'Tschechien'], ['BE', 'Belgien'],
  ['NL', 'Niederlande'], ['DK', 'Dänemark'], ['PL', 'Polen'], ['GB', 'Großbritannien'], ['IE', 'Irland'],
  ['FR', 'Frankreich'], ['IT', 'Italien'], ['ES', 'Spanien'], ['PT', 'Portugal'], ['SE', 'Schweden'],
  ['NO', 'Norwegen'], ['FI', 'Finnland'], ['HU', 'Ungarn'], ['HR', 'Kroatien'], ['GR', 'Griechenland'],
  ['US', 'USA'], ['CA', 'Kanada'], ['MX', 'Mexiko'], ['BR', 'Brasilien'], ['JP', 'Japan'], ['CN', 'China'],
  ['TH', 'Thailand'], ['IN', 'Indien'], ['AU', 'Australien'], ['NZ', 'Neuseeland'], ['ZA', 'Südafrika'],
].map(([code, name]) => ({ code, name }));

export const BINGO_COUNTRIES = ['DE', 'AT', 'CZ', 'BE', 'NL', 'GB', 'IE', 'DK', 'PL', 'IT', 'US', 'MX', 'JP', 'FR', 'ES', 'CH'];

export function countryName(code) {
  return COUNTRIES.find((c) => c.code === code)?.name || code || '';
}

export function countryFlag(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ---------- Orte ----------

export function placeKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Auswertung „wo trinke ich was“: ein Eintrag pro Ort (Groß-/Kleinschreibung egal).
 * { key, name, count, avgRating, ratedCount, beers: [{beerId, n}], lastTs, lat, lon, tastings }
 */
export function placeStats(state) {
  const m = new Map();
  const sorted = [...state.tastings].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  for (const t of sorted) {
    const key = placeKey(t.location);
    if (!key) continue;
    const p = m.get(key) || { key, name: t.location.trim(), count: 0, ratingSum: 0, ratedCount: 0, beerCounts: new Map(), lastTs: null, lat: null, lon: null, tastings: [] };
    p.count += 1;
    if (t.rating) { p.ratingSum += t.rating; p.ratedCount += 1; }
    p.beerCounts.set(t.beerId, (p.beerCounts.get(t.beerId) || 0) + 1);
    p.lastTs = t.ts;
    p.name = t.location.trim(); // jüngste Schreibweise
    if (typeof t.lat === 'number' && typeof t.lon === 'number') { p.lat = t.lat; p.lon = t.lon; }
    p.tastings.push(t);
    m.set(key, p);
  }
  return [...m.values()].map((p) => ({
    key: p.key, name: p.name, count: p.count, ratedCount: p.ratedCount,
    avgRating: p.ratedCount ? p.ratingSum / p.ratedCount : null,
    beers: [...p.beerCounts.entries()].map(([beerId, n]) => ({ beerId, n })).sort((a, b) => b.n - a.n),
    lastTs: p.lastTs, lat: p.lat, lon: p.lon, tastings: p.tastings.reverse(),
  })).sort((a, b) => b.count - a.count || (a.lastTs < b.lastTs ? 1 : -1));
}

/** Nächster bekannter Ort mit Koordinaten innerhalb maxKm – oder null. */
export function nearestPlace(state, lat, lon, maxKm = 0.25) {
  let best = null;
  for (const p of placeStats(state)) {
    if (p.lat == null) continue;
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { ...p, distanceKm: d };
  }
  return best;
}

// ---------- Erfolge & Bingo ----------

/** Sorten, die mindestens einmal getrunken wurden (Tasting oder Konsum). */
function drunkBeerIds(state) {
  return new Set(drinkEvents(state).map((e) => e.beerId));
}

/**
 * Stil-Bingo: bingoIds = Lexikon-IDs, findStyle = Zuordnungsfunktion (aus styles.js).
 * Liefert [{id, done, beerIds}]
 */
export function styleBingo(state, bingoIds, findStyle) {
  const drunk = drunkBeerIds(state);
  const hits = new Map(bingoIds.map((id) => [id, []]));
  for (const b of state.beers) {
    if (!drunk.has(b.id)) continue;
    const s = findStyle(b.style);
    if (s && hits.has(s.id)) hits.get(s.id).push(b.id);
  }
  return bingoIds.map((id) => ({ id, done: hits.get(id).length > 0, beerIds: hits.get(id) }));
}

export function countryBingo(state, codes = BINGO_COUNTRIES) {
  const drunk = drunkBeerIds(state);
  return codes.map((code) => {
    const beerIds = state.beers.filter((b) => b.country === code && drunk.has(b.id)).map((b) => b.id);
    return { code, done: beerIds.length > 0, beerIds };
  });
}

/** Bingo-Linien (Zeilen, Spalten, Diagonalen) in einem 4×4-Feld. */
export function bingoLines(cells, size = 4) {
  const done = (i) => cells[i]?.done;
  let lines = 0;
  for (let r = 0; r < size; r++) if ([...Array(size)].every((_, c) => done(r * size + c))) lines++;
  for (let c = 0; c < size; c++) if ([...Array(size)].every((_, r) => done(r * size + c))) lines++;
  if ([...Array(size)].every((_, i) => done(i * size + i))) lines++;
  if ([...Array(size)].every((_, i) => done(i * size + (size - 1 - i)))) lines++;
  return lines;
}

/** Abzeichen mit Fortschritt. findStyle optional für das Stil-Abzeichen. */
export function badges(state, findStyle = null) {
  const events = drinkEvents(state);
  const drunk = new Set(events.map((e) => e.beerId));
  const beersById = new Map(state.beers.map((b) => [b.id, b]));
  const drunkBeers = [...drunk].map((id) => beersById.get(id)).filter(Boolean);
  const total = sumEvents(events).bottles;
  const tastings = state.tastings;
  const emptied = state.crates.filter((c) => crateEmptiedAt(c, state.consumptions, state.tastings)).length;
  const places = new Set(tastings.map((t) => placeKey(t.location)).filter(Boolean)).size;
  const countries = new Set(drunkBeers.map((b) => b.country).filter(Boolean)).size;
  const breweries = new Set(drunkBeers.map((b) => placeKey(b.brewery)).filter(Boolean)).size;
  const styles = findStyle ? new Set(drunkBeers.map((b) => findStyle(b.style)?.id).filter(Boolean)).size : 0;
  const afCount = events.filter((e) => e.alcoholFree).reduce((a, e) => a + e.bottles, 0);
  const cratesPerBeer = Math.max(0, ...[...state.crates.reduce((m, c) => m.set(c.beerId, (m.get(c.beerId) || 0) + 1), new Map()).values()]);
  const perfect = tastings.filter((t) => t.rating === 5).length;

  const def = [
    ['first', '🍺', 'Prost!', 'Das erste Bier erfasst', total, 1],
    ['taster10', '📝', 'Verkoster', '10 Tastings', tastings.length, 10],
    ['taster50', '🎓', 'Kenner', '50 Tastings', tastings.length, 50],
    ['taster100', '🏆', 'Biersommelier', '100 Tastings', tastings.length, 100],
    ['variety10', '🧭', 'Entdecker', '10 verschiedene Sorten', drunk.size, 10],
    ['variety50', '🗺️', 'Sortenjäger', '50 verschiedene Sorten', drunk.size, 50],
    ['breweries5', '🏭', 'Brauerei-Tour', 'Biere aus 5 Brauereien', breweries, 5],
    ['styles8', '🎨', 'Stil-Sammler', '8 verschiedene Bierstile', styles, 8],
    ['countries5', '🌍', 'Weltenbummler', 'Biere aus 5 Ländern', countries, 5],
    ['places5', '📍', 'Stammgast überall', 'An 5 Orten verkostet', places, 5],
    ['crate1', '📦', 'Kasten geschafft', 'Den ersten Kasten leer getrunken', emptied, 1],
    ['crate10', '🏗️', 'Vorratsmeister', '10 Kästen leer getrunken', emptied, 10],
    ['loyal3', '❤️', 'Treue Seele', '3 Kästen derselben Sorte gekauft', cratesPerBeer, 3],
    ['af10', '🧃', 'Klarer Kopf', '10 alkoholfreie Biere', afCount, 10],
    ['notes10', '✍️', 'Kritiker', '10 Tastings mit Notiz', tastings.filter((t) => t.note).length, 10],
    ['photos10', '📸', 'Fotograf', '10 Tastings mit Foto', tastings.filter((t) => t.photo).length, 10],
    ['perfect', '⭐', 'Volltreffer', 'Ein Bier mit 5 Sternen bewertet', perfect, 1],
  ];
  return def.map(([id, icon, title, desc, value, goal]) => ({ id, icon, title, desc, value: Math.min(value, goal), goal, done: value >= goal }));
}

// ---------- Kalender ----------

/** Tagessummen: Map 'YYYY-MM-DD' → {bottles, ml, af, alc} */
export function dailyTotals(events) {
  const m = new Map();
  for (const e of events) {
    const k = toDateKey(e.ts);
    const d = m.get(k) || { bottles: 0, ml: 0, af: 0, alc: 0 };
    d.bottles += e.bottles;
    d.ml += e.ml;
    if (e.alcoholFree) d.af += e.bottles; else d.alc += e.bottles;
    m.set(k, d);
  }
  return m;
}

/** Stufe 0–4 für die Einfärbung: 0 = nichts, 1 = 1, 2 = 2, 3 = 3–4, 4 = 5+ */
export function calendarLevel(bottles) {
  if (!bottles) return 0;
  if (bottles === 1) return 1;
  if (bottles === 2) return 2;
  if (bottles <= 4) return 3;
  return 4;
}

/** Wochen eines Monats (Mo–So), Tage außerhalb des Monats = null. month: 0–11 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => toDateKey(new Date(year, month, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Kennzahlen für einen Zeitraum [fromKey, toKey] (inklusive, YYYY-MM-DD):
 * aktive Tage, Tage gesamt, längste Pause (Tage ohne Bier), längste Serie.
 * Zukünftige Tage (nach todayKey) zählen nicht mit.
 */
export function calendarSummary(totals, fromKey, toKey, todayKey = toDateKey(new Date())) {
  const end = toKey < todayKey ? toKey : todayKey;
  let active = 0, days = 0, pause = 0, maxPause = 0, streak = 0, maxStreak = 0;
  for (let d = parseDate(fromKey); toDateKey(d) <= end; d.setDate(d.getDate() + 1)) {
    days += 1;
    if (totals.get(toDateKey(d))?.bottles) {
      active += 1; streak += 1; pause = 0;
    } else {
      pause += 1; streak = 0;
    }
    maxPause = Math.max(maxPause, pause);
    maxStreak = Math.max(maxStreak, streak);
  }
  return { active, days, maxPause, maxStreak };
}
