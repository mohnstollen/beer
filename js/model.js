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
