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
