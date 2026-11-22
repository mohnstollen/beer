import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';

function fixture() {
  const beers = [
    { id: 'rb', name: 'Radeberger Pilsner', brewery: 'Radeberger', style: 'Pils', abv: 4.8, alcoholFree: false },
    { id: 'rb0', name: 'Radeberger Alkoholfrei', brewery: 'Radeberger', style: 'Pils', abv: 0, alcoholFree: true, variantOf: 'rb' },
    { id: 'aug', name: 'Augustiner Hell', brewery: 'Augustiner', style: 'Helles', abv: 5.2, alcoholFree: false },
  ];
  const crates = [
    { id: 'c1', beerId: 'rb', purchaseDate: '2026-11-01', count: 20, unitMl: 500, price: 1800, packaging: 'k20x05' },
    { id: 'c2', beerId: 'rb0', purchaseDate: '2026-11-10', count: 6, unitMl: 330, price: 600, packaging: 's6x033' },
  ];
  const consumptions = [
    { id: 'k1', crateId: 'c1', ts: '2026-11-02T18:00:00.000Z', qty: 3, ml: 1500 },
    { id: 'k2', crateId: 'c1', ts: '2026-11-03T18:00:00.000Z', qty: 1, ml: 500 },
    { id: 'k3', crateId: 'c2', ts: '2026-11-11T18:00:00.000Z', qty: 5, ml: 1650 },
  ];
  const tastings = [
    { id: 't1', beerId: 'rb', crateId: 'c1', ts: '2026-11-01T19:00:00.000Z', rating: 4, tags: ['süffig'], note: 'frisch', location: '', ml: 500 },
    { id: 't2', beerId: 'aug', crateId: null, ts: '2026-11-05T19:00:00.000Z', rating: 5, tags: ['mild'], note: '', location: 'Biergarten', ml: 1000, price: 1050 },
    { id: 't3', beerId: 'rb0', crateId: 'c2', ts: '2026-11-12T19:00:00.000Z', rating: 3, tags: [], note: '', location: '', ml: 330 },
  ];
  return { beers, crates, consumptions, tastings, meta: {} };
}

test('Restmenge zählt Konsum und verknüpfte Tastings', () => {
  const s = fixture();
  assert.equal(M.crateRemaining(s.crates[0], s.consumptions, s.tastings), 20 - 4 - 1);
  assert.equal(M.crateRemaining(s.crates[1], s.consumptions, s.tastings), 0);
});

test('Kasten gilt als leer und hat eine Dauer', () => {
  const s = fixture();
  assert.equal(M.crateEmptiedAt(s.crates[0], s.consumptions, s.tastings), null);
  assert.equal(M.crateEmptiedAt(s.crates[1], s.consumptions, s.tastings), '2026-11-12T19:00:00.000Z');
  assert.equal(M.crateDurationDays(s.crates[1], s.consumptions, s.tastings), 2);
});

test('openCrates liefert nur Kästen mit Rest', () => {
  const s = fixture();
  const open = M.openCrates(s);
  assert.deepEqual(open.map((x) => x.crate.id), ['c1']);
  assert.equal(open[0].remaining, 15);
});

test('Tasting zählt als 1 Bier, Konsum nach Menge', () => {
  const s = fixture();
  const sum = M.sumEvents(M.drinkEvents(s));
  assert.equal(sum.bottles, 3 + 1 + 5 + 3);
  assert.equal(sum.ml, 1500 + 500 + 1650 + 500 + 1000 + 330);
});

test('Alkoholfrei zählt mit 0 g Alkohol und lässt sich filtern', () => {
  const s = fixture();
  const ev = M.drinkEvents(s);
  const af = M.filterEvents(ev, { alc: 'af' });
  assert.equal(M.sumEvents(af).bottles, 6);
  assert.equal(M.sumEvents(af).grams, 0);
  const alc = M.filterEvents(ev, { alc: 'alc' });
  assert.equal(M.sumEvents(alc).bottles, 6);
  // 2500 ml × 4,8 % + 1000 ml × 5,2 %, Dichte 0,789
  const expected = (2500 * 0.048 + 1000 * 0.052) * 0.789;
  assert.ok(Math.abs(M.sumEvents(alc).grams - expected) < 1e-9);
});

test('Ausgaben pro Monat aus Kästen und Tasting-Preisen', () => {
  const s = fixture();
  const m = M.spendingByMonth(s);
  assert.equal(m.get('2026-11'), 1800 + 600 + 1050);
});

test('Preis pro Flasche und Liter', () => {
  const s = fixture();
  assert.equal(M.cratePricePerBottle(s.crates[0]), 90);
  assert.equal(M.cratePricePerLiter(s.crates[0]), 180);
});

test('Lieblingssorten – Varianten zusammenfassen', () => {
  const s = fixture();
  const byRating = M.favoritesByRating(s);
  assert.equal(byRating[0].beerId, 'aug');
  const grouped = M.favoritesByRating(s, { groupVariants: true });
  const rb = grouped.find((x) => x.beerId === 'rb');
  assert.equal(rb.n, 2);
  assert.equal(rb.avg, 3.5);
  const byCount = M.favoritesByConsumption(M.drinkEvents(s), s.beers, { groupVariants: true });
  assert.equal(byCount[0].beerId, 'rb');
  assert.equal(byCount[0].bottles, 5 + 6);
});

test('Suche nach Text, Note und Brauerei', () => {
  const s = fixture();
  const ev = M.drinkEvents(s);
  assert.deepEqual(M.searchEvents(ev, s, { q: 'biergarten' }).map((e) => e.id), ['t2']);
  assert.deepEqual(M.searchEvents(ev, s, { minRating: 4 }).map((e) => e.id).sort(), ['t1', 't2']);
  assert.equal(M.searchEvents(ev, s, { brewery: 'Radeberger' }).length, 5);
  assert.equal(M.searchEvents(ev, s, { kind: 'tasting' }).length, 3);
});

test('Wochen-/Monatsbuckets sind lückenlos', () => {
  const s = fixture();
  const ev = M.drinkEvents(s);
  const weeks = M.lastWeeks(ev, 4, new Date('2026-11-20T12:00:00'));
  assert.equal(weeks.length, 4);
  assert.equal(weeks.reduce((a, w) => a + w.bottles, 0), 12);
  const months = M.lastMonths(ev, 3, new Date('2026-11-20T12:00:00'));
  assert.deepEqual(months.map((m) => m.key), ['2026-09', '2026-10', '2026-11']);
  assert.equal(months[2].bottles, 12);
});

test('weekKey liefert Montag', () => {
  assert.equal(M.weekKey(new Date('2026-11-22T12:00:00')), '2026-11-16'); // Sonntag
  assert.equal(M.weekKey(new Date('2026-11-16T00:30:00')), '2026-11-16'); // Montag
});

test('Euro- und Dezimal-Parsing mit Komma', () => {
  assert.equal(M.parseEuro('17,99'), 1799);
  assert.equal(M.parseEuro('4.5 €'), 450);
  assert.equal(M.parseEuro(''), null);
  assert.equal(M.parseDecimal('0,33'), 0.33);
});

test('CSV-Export escaped Semikolon und Anführungszeichen', () => {
  const s = fixture();
  s.tastings[0].note = 'herb; "frisch"';
  const csv = M.eventsToCsv(s);
  const lines = csv.split('\n');
  assert.equal(lines.length, 1 + 6);
  assert.ok(csv.includes('"herb; ""frisch"""'));
});

test('suggestions sortiert nach Häufigkeit', () => {
  assert.deepEqual(M.suggestions(['Rewe', 'Edeka', 'Rewe', '', null, ' Rewe ']), ['Rewe', 'Edeka']);
});

test('Hinweise: fast leer, leer, MHD bald/abgelaufen', () => {
  const s = fixture();
  const now = new Date('2026-11-14T12:00:00');
  // c1: 15 übrig → kein Nachkauf; c2 (alkoholfrei) seit 12.11. leer → 'empty'
  let a = M.alerts(s, {}, now);
  assert.deepEqual(a.map((x) => x.type), ['empty']);
  assert.equal(a[0].beerId, 'rb0');

  // c1 bis auf 2 leeren → 'low'
  s.consumptions.push({ id: 'k4', crateId: 'c1', ts: '2026-11-13T18:00:00.000Z', qty: 13, ml: 6500 });
  a = M.alerts(s, {}, now);
  assert.ok(a.some((x) => x.type === 'low' && x.beerId === 'rb' && x.remaining === 2));

  // MHD: in 5 Tagen → 'mhd', gestern → 'expired'
  s.crates[0].bestBefore = '2026-11-19';
  assert.ok(M.alerts(s, {}, now).some((x) => x.type === 'mhd' && x.days === 5));
  s.crates[0].bestBefore = '2026-11-13';
  assert.equal(M.alerts(s, {}, now)[0].type, 'expired');

  // Leerer Kasten älter als emptyDays → kein Hinweis mehr
  assert.ok(!M.alerts(s, {}, new Date('2026-11-30T12:00:00')).some((x) => x.type === 'empty'));
});

test('Hinweise: Einzelflasche löst keinen Nachkauf aus, Wegklicken wirkt', () => {
  const s = fixture();
  s.crates.push({ id: 'e1', beerId: 'aug', purchaseDate: '2026-11-10', count: 1, unitMl: 500, price: null, packaging: 'single' });
  const now = new Date('2026-11-14T12:00:00');
  assert.ok(!M.alerts(s, {}, now).some((x) => x.beerId === 'aug'));
  const keys = M.alerts(s, {}, now).map((x) => x.key);
  assert.equal(M.activeAlerts(s, {}, keys, now).length, 0);
});

import { findStyle, BINGO_STYLES } from '../js/styles.js';

test('Stil-Zuordnung aus freier Eingabe', () => {
  assert.equal(findStyle('Pilsener').id, 'pils');
  assert.equal(findStyle('Hefeweizen').id, 'weissbier');
  assert.equal(findStyle('Bayerisches Hefeweizen dunkel').id, 'weissbier');
  assert.equal(findStyle('Märzen').id, 'maerzen');
  assert.equal(findStyle('Kölsch').id, 'koelsch');
  assert.equal(findStyle('Hazy IPA').id, 'ipa');
  assert.equal(findStyle(''), null);
  assert.equal(findStyle('Fantasie'), null);
});

test('Orte: Gruppierung, Note, Koordinaten, nächster Ort', () => {
  const s = fixture();
  s.tastings.push({ id: 't4', beerId: 'rb', ts: '2026-11-06T19:00:00.000Z', rating: 3, tags: [], location: ' biergarten ', lat: 48.15, lon: 11.58, ml: 500 });
  const places = M.placeStats(s);
  assert.equal(places.length, 1);
  assert.equal(places[0].count, 2);
  assert.equal(places[0].avgRating, 4);
  assert.equal(places[0].name, 'biergarten');
  assert.equal(places[0].lat, 48.15);
  assert.equal(M.nearestPlace(s, 48.1505, 11.5805)?.key, 'biergarten');
  assert.equal(M.nearestPlace(s, 48.2, 11.6), null);
  assert.ok(Math.abs(M.haversineKm(52.52, 13.405, 48.137, 11.575) - 504) < 2); // Berlin–München
});

test('Erfolge und Bingo', () => {
  const s = fixture();
  s.beers[0].country = 'DE';
  s.beers[2].country = 'DE';
  const b = Object.fromEntries(M.badges(s, findStyle).map((x) => [x.id, x]));
  assert.equal(b.first.done, true);
  assert.equal(b.crate1.done, true);      // c2 ist leer
  assert.equal(b.perfect.done, true);     // Augustiner 5 Sterne
  assert.equal(b.taster10.value, 3);
  assert.equal(b.taster10.done, false);
  const sb = M.styleBingo(s, BINGO_STYLES, findStyle);
  assert.equal(sb.length, 16);
  assert.deepEqual(sb.filter((x) => x.done).map((x) => x.id).sort(), ['helles', 'pils']);
  const cb = M.countryBingo(s);
  assert.deepEqual(cb.filter((x) => x.done).map((x) => x.code), ['DE']);
  const all = Array.from({ length: 16 }, (_, i) => ({ done: i < 4 || i % 4 === 0 }));
  assert.equal(M.bingoLines(all), 2); // erste Zeile + erste Spalte
  assert.equal(M.countryFlag('DE'), '🇩🇪');
});

test('Kalender: Tagessummen, Stufen, Monatsraster, Pausen', () => {
  const s = fixture();
  const totals = M.dailyTotals(M.drinkEvents(s));
  const k = M.toDateKey('2026-11-02T18:00:00.000Z');
  assert.equal(totals.get(k).bottles, 3);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(M.calendarLevel), [0, 1, 2, 3, 3, 4, 4]);
  const grid = M.monthGrid(2026, 10); // November 2026 beginnt an einem Sonntag
  assert.equal(grid[0].filter(Boolean).length, 1);
  assert.equal(grid[0][6], '2026-11-01');
  assert.equal(grid.flat().filter(Boolean).length, 30);
  const t = new Map([['2026-11-01', { bottles: 1 }], ['2026-11-02', { bottles: 2 }], ['2026-11-06', { bottles: 1 }]]);
  assert.deepEqual(M.calendarSummary(t, '2026-11-01', '2026-11-30', '2026-11-08'),
    { active: 3, days: 8, maxPause: 3, maxStreak: 2 });
});
