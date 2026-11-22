import * as db from './db.js';
import * as M from './model.js';
import {
  h, clear, openSheet, closeSheet, closeAllSheets, toast, field, toggle, segmented, chips, stars,
  stepper, datalist, blobUrl, photoField, barChart, shareBar,
} from './ui.js';
import { STYLE_LEXICON, findStyle, BINGO_STYLES } from './styles.js';
import { scanBarcode, lookupOpenFoodFacts, getPosition, osmLink, openMapSheet } from './extras.js';

const state = { beers: [], crates: [], consumptions: [], tastings: [], meta: {} };
const ui = {
  stockTab: 'open',
  history: { q: '', kind: 'all', minRating: 0, period: 'all', beerId: '', brewery: '' },
  stats: { period: 'month', alc: 'all', groupVariants: false },
  cal: { mode: 'month', year: new Date().getFullYear(), month: new Date().getMonth() },
};

const STYLES = [...STYLE_LEXICON.map((x) => x.name), 'Zwickel', 'Weizenbock', 'Hazy IPA', 'Imperial Stout'];

// ---------- Daten ----------

const beersById = () => new Map(state.beers.map((b) => [b.id, b]));
const cratesById = () => new Map(state.crates.map((c) => [c.id, c]));
const tags = () => state.meta.tags || M.DEFAULT_TAGS;
const alertSettings = () => ({ ...M.DEFAULT_ALERT_SETTINGS, ...(state.meta.alertSettings || {}) });
const currentAlerts = () => M.activeAlerts(state, alertSettings(), state.meta.dismissedAlerts || []);
const nowIso = () => new Date().toISOString();

async function save(store, obj) {
  await db.put(store, obj);
  const arr = state[store];
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i === -1) arr.push(obj); else arr[i] = obj;
  render();
  return obj;
}

async function remove(store, id) {
  await db.del(store, id);
  state[store] = state[store].filter((x) => x.id !== id);
  render();
}

async function saveMeta(key, value) {
  await db.put('meta', { key, value });
  state.meta[key] = value;
  render();
}

function beerName(id) {
  return beersById().get(id)?.name || 'Unbekannte Sorte';
}

function remainingOf(crate) {
  return M.crateRemaining(crate, state.consumptions, state.tastings);
}

// ---------- Datum/Zeit-Helfer ----------

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const dateLongFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: '2-digit', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('de-DE', { month: 'short' });

function fmtDay(dateStr) {
  return dateStr ? dayFmt.format(M.parseDate(dateStr)) : '–';
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 16);
}

function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : nowIso();
}

function yesterdayEvening() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(20, 0, 0, 0);
  return d.toISOString();
}

function dayLabel(iso) {
  const key = M.toDateKey(iso);
  const today = M.toDateKey(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Heute';
  if (key === M.toDateKey(y)) return 'Gestern';
  return dateLongFmt.format(new Date(iso));
}

function periodRange(period) {
  const now = new Date();
  let from = null;
  if (period === 'week') from = new Date(M.weekKey(now) + 'T00:00:00');
  else if (period === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
  else if (period === '7d') { from = new Date(now); from.setDate(from.getDate() - 7); }
  else if (period === '30d') { from = new Date(now); from.setDate(from.getDate() - 30); }
  return { from: from ? from.toISOString() : null, to: null };
}

// ---------- Aktionen ----------

async function bookConsumption(crate, qty = 1, ts = nowIso()) {
  const entry = { id: db.uid(), crateId: crate.id, ts, qty, ml: qty * crate.unitMl, createdAt: nowIso() };
  await save('consumptions', entry);
  const rest = remainingOf(crate);
  const msg = `+${qty} ${beerName(crate.beerId)} · ` + (rest ? `${rest} übrig` : 'Kasten leer ✓');
  toast(msg, { action: 'Rückgängig', onAction: () => remove('consumptions', entry.id) });
}

function onPlusOne() {
  const open = M.openCrates(state);
  if (open.length === 0) return openCrateSheet();
  if (open.length === 1) return bookConsumption(open[0].crate);
  openDrinkSheet();
}

function lastEntry() {
  const all = [
    ...state.consumptions.map((c) => ({ kind: 'consumption', ref: c })),
    ...state.tastings.map((t) => ({ kind: 'tasting', ref: t })),
  ];
  all.sort((a, b) => (a.ref.createdAt < b.ref.createdAt ? 1 : -1));
  return all[0] || null;
}

async function undoLast() {
  const last = lastEntry();
  if (!last) return;
  if (last.kind === 'tasting') {
    if (!confirm(`Tasting „${beerName(last.ref.beerId)}“ löschen?`)) return;
    await remove('tastings', last.ref.id);
  } else {
    await remove('consumptions', last.ref.id);
  }
  toast('Letzter Eintrag entfernt');
}

// ---------- Rendering / Router ----------

const VIEWS = { start: viewStart, stock: viewStock, history: viewHistory, stats: viewStats, more: viewMore };

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '');
  return VIEWS[r] ? r : 'start';
}

let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    const route = currentRoute();
    const main = document.getElementById('view');
    const scroll = main.scrollTop;
    clear(main).append(VIEWS[route]());
    main.scrollTop = scroll;
    const nAlerts = currentAlerts().length;
    for (const a of document.querySelectorAll('#tabs a')) {
      a.classList.toggle('active', a.dataset.route === route);
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      if (a.dataset.route === 'start') a.classList.toggle('has-alert', nAlerts > 0);
    }
    updateAppBadge(nAlerts);
  });
}

window.addEventListener('hashchange', () => {
  document.getElementById('view').scrollTop = 0;
  render();
});

// ---------- Bausteine ----------

function progress(rest, total) {
  const pct = total ? (rest / total) * 100 : 0;
  return h('div', { class: 'progress' + (pct <= 20 ? ' low' : ''), role: 'img', 'aria-label': `${rest} von ${total} übrig` },
    h('div', { style: { width: `${pct}%` } }));
}

function crateRow(crate, { compact = false } = {}) {
  const rest = remainingOf(crate);
  const pack = M.packagingByKey(crate.packaging)?.label || `${crate.count}×${M.fmtMl(crate.unitMl)}`;
  const settings = alertSettings();
  const mhdSoon = rest > 0 && crate.bestBefore && M.daysBetween(new Date(), crate.bestBefore) <= settings.mhdDays;
  const meta = [
    compact ? null : pack,
    compact ? null : crate.store,
    compact ? null : (crate.price != null ? M.fmtEuro(crate.price) : null),
  ].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'crate-row', onclick: () => openCrateDetail(crate) },
    h('div', { class: 'crate-main' },
      h('strong', null, beerName(crate.beerId)),
      h('span', { class: 'crate-count' }, rest ? `${rest}/${crate.count}` : 'leer')),
    rest ? progress(rest, crate.count) : null,
    h('div', { class: 'crate-meta' },
      meta ? h('span', null, meta) : null,
      crate.bestBefore ? h('span', { class: mhdSoon ? 'warn' : '' }, `MHD ${fmtDay(crate.bestBefore)}`) : null,
      rest && rest <= settings.lowThreshold && crate.count > settings.lowThreshold ? h('span', { class: 'warn' }, 'fast leer') : null));
}

// ---------- Hinweise (Nachkauf, MHD) ----------

function alertText(a) {
  const name = beerName(a.beerId);
  if (a.type === 'expired') {
    const d = -a.days;
    return { icon: '⚠️', title: `${name}: MHD abgelaufen`, sub: `seit ${d} ${d === 1 ? 'Tag' : 'Tagen'} · noch ${a.remaining} übrig` };
  }
  if (a.type === 'mhd') {
    const when = a.days === 0 ? 'heute' : a.days === 1 ? 'morgen' : `in ${a.days} Tagen`;
    return { icon: '⏳', title: `${name}: MHD ${when}`, sub: `noch ${a.remaining} übrig – bald trinken` };
  }
  if (a.type === 'low') {
    return { icon: '🛒', title: `${name} fast leer`, sub: `nur noch ${a.remaining} übrig – nachkaufen?` };
  }
  return { icon: '🛒', title: `${name} ist leer`, sub: `leer seit ${fmtDay(M.toDateKey(a.emptiedAt))} – nachkaufen?` };
}

async function dismissAlert(key) {
  const valid = new Set(M.alerts(state, alertSettings()).map((a) => a.key));
  const list = [...(state.meta.dismissedAlerts || []).filter((k) => valid.has(k)), key];
  await saveMeta('dismissedAlerts', list);
  toast('Hinweis ausgeblendet', {
    action: 'Rückgängig',
    onAction: () => saveMeta('dismissedAlerts', list.filter((k) => k !== key)),
  });
}

function alertsSection() {
  const list = currentAlerts();
  if (!list.length) return null;
  const crates = cratesById();
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Hinweise')),
    h('div', { class: 'card list alerts' }, list.map((a) => {
      const t = alertText(a);
      const crate = crates.get(a.crateId);
      const action = a.type === 'low' || a.type === 'empty'
        ? h('button', { type: 'button', class: 'btn small', onclick: () => openCrateSheet({ beerId: a.beerId, template: crate }) }, 'Nachkauf')
        : h('button', { type: 'button', class: 'btn small primary', onclick: () => bookConsumption(crate) }, '+1');
      return h('div', { class: `alert alert-${a.type}` },
        h('span', { class: 'alert-icon', 'aria-hidden': 'true' }, t.icon),
        h('button', { type: 'button', class: 'alert-main', onclick: () => crate && openCrateDetail(crate) },
          h('strong', null, t.title), h('span', null, t.sub)),
        action,
        h('button', { type: 'button', class: 'alert-close', 'aria-label': 'Hinweis ausblenden', onclick: () => dismissAlert(a.key) }, '✕'));
    })));
}

function updateAppBadge(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch { /* nicht unterstützt */ }
}

function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('p', null, text), action);
}

// ---------- Ansicht: Start ----------

function viewStart() {
  const open = M.openCrates(state);
  const events = M.drinkEvents(state);
  const week = M.sumEvents(M.filterEvents(events, periodRange('week')));
  const last = lastEntry();

  let plusSub = 'Kein offener Kasten – Kasten anlegen';
  if (open.length === 1) plusSub = `${beerName(open[0].crate.beerId)} · ${open[0].remaining} übrig`;
  else if (open.length > 1) plusSub = `${open.length} offene Kästen – auswählen`;

  let pressTimer = null;
  let longPressed = false;
  const plus = h('button', {
    type: 'button', class: 'plus-one',
    onpointerdown: () => { longPressed = false; pressTimer = setTimeout(() => { longPressed = true; if (open.length) openDrinkSheet(); }, 550); },
    onpointerup: () => clearTimeout(pressTimer),
    onpointerleave: () => clearTimeout(pressTimer),
    oncontextmenu: (e) => e.preventDefault(),
    onclick: () => { if (!longPressed) onPlusOne(); },
  }, h('span', { class: 'plus-label' }, '🍺 +1 getrunken'), h('span', { class: 'plus-sub' }, plusSub));

  return h('div', { class: 'view start' },
    h('header', { class: 'view-head' }, h('h1', null, 'Prost!'), h('span', { class: 'muted' }, dateFmt.format(new Date()))),
    plus,
    open.length ? h('button', { type: 'button', class: 'link center', onclick: () => openDrinkSheet() }, 'Mehrere oder nachtragen …') : null,
    h('div', { class: 'quick' },
      h('button', { type: 'button', class: 'btn big', onclick: () => openTastingSheet() }, '★ Neues Tasting'),
      h('button', { type: 'button', class: 'btn big', onclick: () => openCrateSheet() }, '▦ Neuer Kasten')),
    alertsSection(),
    last ? h('div', { class: 'last-entry' },
      h('span', null, 'Zuletzt: ',
        last.kind === 'tasting' ? `★ ${beerName(last.ref.beerId)}` : `+${last.ref.qty} ${beerName(cratesById().get(last.ref.crateId)?.beerId)}`,
        ` · ${timeFmt.format(new Date(last.ref.ts))}`),
      h('button', { type: 'button', class: 'link', onclick: undoLast }, 'Rückgängig')) : null,
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Bestand'), h('a', { href: '#/stock' }, 'alle ›')),
      open.length
        ? h('div', { class: 'card list' }, open.slice(0, 4).map(({ crate }) => crateRow(crate, { compact: true })))
        : emptyState('Noch kein offener Kasten.', null)),
    h('p', { class: 'week-summary' }, `Diese Woche: ${week.bottles} Bier · ${M.fmtLiters(week.ml)}`));
}

// ---------- Ansicht: Bestand ----------

function viewStock() {
  const { consumptions, tastings } = state;
  const all = state.crates.map((c) => ({ c, rest: remainingOf(c) }));
  const list = all
    .filter((x) => (ui.stockTab === 'open' ? x.rest > 0 : x.rest === 0))
    .sort((a, b) => {
      if (ui.stockTab === 'open') return (a.c.bestBefore || '9999') < (b.c.bestBefore || '9999') ? -1 : 1;
      const ea = M.crateEmptiedAt(a.c, consumptions, tastings) || '';
      const eb = M.crateEmptiedAt(b.c, consumptions, tastings) || '';
      return ea < eb ? 1 : -1;
    });
  const totals = all.filter((x) => x.rest > 0).reduce((acc, x) => ({ n: acc.n + x.rest, ml: acc.ml + x.rest * x.c.unitMl }), { n: 0, ml: 0 });

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Bestand'),
      segmented([{ value: 'open', label: 'Offen' }, { value: 'empty', label: 'Leer' }], ui.stockTab, (v) => { ui.stockTab = v; render(); }, { small: true })),
    list.length
      ? h('div', { class: 'stack' }, list.map(({ c, rest }) => h('div', { class: 'card crate-card' },
        crateRow(c),
        rest > 0
          ? h('div', { class: 'crate-actions' },
            h('span', { class: 'muted' }, `gekauft ${fmtDay(c.purchaseDate)}`),
            h('button', { type: 'button', class: 'btn small primary', onclick: () => bookConsumption(c) }, '+1'))
          : h('div', { class: 'crate-actions' },
            h('span', { class: 'muted' }, crateEmptyInfo(c))))))
      : emptyState(ui.stockTab === 'open' ? 'Kein offener Kasten.' : 'Noch kein Kasten leer getrunken.',
        ui.stockTab === 'open' ? h('button', { type: 'button', class: 'btn primary', onclick: () => openCrateSheet() }, 'Kasten anlegen') : null),
    ui.stockTab === 'open' && totals.n ? h('p', { class: 'muted center' }, `Gesamt: ${totals.n} Flaschen · ${M.fmtLiters(totals.ml)}`) : null);
}

function crateEmptyInfo(c) {
  const d = M.crateDurationDays(c, state.consumptions, state.tastings);
  const parts = [`gekauft ${fmtDay(c.purchaseDate)}`];
  if (d != null) parts.push(`leer nach ${d} ${d === 1 ? 'Tag' : 'Tagen'}`);
  const ppb = M.cratePricePerBottle(c);
  if (ppb != null) parts.push(`${M.fmtEuro(ppb)}/Fl`);
  return parts.join(' · ');
}

// ---------- Ansicht: Verlauf ----------

function viewHistory() {
  const f = ui.history;
  const events = M.drinkEvents(state);
  const { from } = periodRange(f.period);
  const list = M.searchEvents(events, state, {
    q: f.q, kind: f.kind, minRating: f.minRating, beerId: f.beerId || null, brewery: f.brewery || null, from,
  });
  const bmap = beersById();
  const cmap = cratesById();
  const breweries = M.suggestions(state.beers.map((b) => b.brewery)).sort((a, b) => a.localeCompare(b, 'de'));

  const search = h('input', {
    type: 'search', placeholder: 'Suche Sorte, Brauerei, Notiz, Ort', value: f.q, class: 'search',
    oninput: (e) => { f.q = e.target.value; renderList(); },
  });
  const listEl = h('div', { class: 'history-list' });
  const countEl = h('span', { class: 'muted' }, `${list.length} Einträge`);

  function renderList() {
    const items = M.searchEvents(events, state, {
      q: f.q, kind: f.kind, minRating: f.minRating, beerId: f.beerId || null, brewery: f.brewery || null, from,
    });
    clear(listEl);
    countEl.textContent = `${items.length} Einträge`;
    if (!items.length) { listEl.append(emptyState('Keine Einträge gefunden.', null)); return; }
    let currentDay = null;
    let group = null;
    for (const e of items.slice(0, 500)) {
      const dk = M.toDateKey(e.ts);
      if (dk !== currentDay) {
        currentDay = dk;
        listEl.append(h('h3', { class: 'day' }, dayLabel(e.ts)));
        group = h('div', { class: 'card list' });
        listEl.append(group);
      }
      const beer = bmap.get(e.beerId);
      if (e.kind === 'tasting') {
        const t = e.ref;
        const sub = [(t.tags || []).join(', '), t.location ? `📍 ${t.location}` : null, t.note ? `„${t.note}“` : null].filter(Boolean).join(' · ');
        group.append(h('button', { type: 'button', class: 'entry', onclick: () => openTastingSheet({ tasting: t }) },
          t.photo ? h('img', { class: 'thumb', src: blobUrl(t.photo), alt: '' }) : h('span', { class: 'entry-icon' }, '★'),
          h('div', { class: 'entry-main' },
            h('div', { class: 'entry-title' }, h('strong', null, beer?.name || '?'),
              t.rating ? stars(t.rating, null, { size: 'sm', readonly: true }) : null),
            sub ? h('div', { class: 'entry-sub' }, sub) : null),
          h('span', { class: 'entry-time' }, timeFmt.format(new Date(e.ts)))));
      } else {
        const crate = cmap.get(e.ref.crateId);
        group.append(h('button', { type: 'button', class: 'entry', onclick: () => openConsumptionSheet(e.ref) },
          h('span', { class: 'entry-icon' }, '🍺'),
          h('div', { class: 'entry-main' },
            h('div', { class: 'entry-title' }, h('strong', null, `×${e.ref.qty} ${beer?.name || '?'}`)),
            h('div', { class: 'entry-sub' }, `aus Kasten vom ${fmtDay(crate?.purchaseDate)}`)),
          h('span', { class: 'entry-time' }, timeFmt.format(new Date(e.ts)))));
      }
    }
  }
  renderList();

  const sel = (value, options, onChange, label) => h('select', { 'aria-label': label, onchange: (e) => { onChange(e.target.value); render(); }, value },
    options.map((o) => h('option', { value: o.value }, o.label)));

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Verlauf'), countEl),
    search,
    h('div', { class: 'filters' },
      segmented([{ value: 'all', label: 'Alle' }, { value: 'tasting', label: 'Tastings' }, { value: 'consumption', label: 'Kasten' }], f.kind,
        (v) => { f.kind = v; render(); }, { small: true }),
      h('div', { class: 'filter-row' },
        sel(String(f.minRating), [{ value: '0', label: 'Note: alle' }, ...[5, 4, 3, 2].map((n) => ({ value: String(n), label: `★ ≥ ${n}` }))],
          (v) => { f.minRating = Number(v); }, 'Mindestnote'),
        sel(f.period, [{ value: 'all', label: 'Zeit: alles' }, { value: '7d', label: '7 Tage' }, { value: '30d', label: '30 Tage' }, { value: 'year', label: 'Dieses Jahr' }],
          (v) => { f.period = v; }, 'Zeitraum'),
        sel(f.beerId, [{ value: '', label: 'Sorte: alle' }, ...[...state.beers].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((b) => ({ value: b.id, label: b.name }))],
          (v) => { f.beerId = v; }, 'Sorte'),
        breweries.length ? sel(f.brewery, [{ value: '', label: 'Brauerei: alle' }, ...breweries.map((b) => ({ value: b, label: b }))],
          (v) => { f.brewery = v; }, 'Brauerei') : null)),
    listEl);
}

// ---------- Ansicht: Statistik ----------

function viewStats() {
  const s = ui.stats;
  const all = M.drinkEvents(state);
  const alcFiltered = M.filterEvents(all, { alc: s.alc });
  const range = periodRange(s.period);
  const inPeriod = M.filterEvents(alcFiltered, range);
  const sum = M.sumEvents(inPeriod);
  const spending = M.spendingByMonth(state, range);
  const spendTotal = [...spending.values()].reduce((a, b) => a + b, 0);
  const series = s.alc === 'af' ? 'af' : 'alc';
  const bmap = beersById();

  const stacked = s.alc === 'all';
  const afEvents = M.filterEvents(all, { alc: 'af' });
  const afWeeks = M.lastWeeks(afEvents, 12);
  const weeks = M.lastWeeks(alcFiltered, 12).map((w, i) => {
    const d = M.parseDate(w.key);
    return { label: `${d.getDate()}.${d.getMonth() + 1}.`, tip: `Woche ab ${dayFmt.format(d)}`, value: w.bottles, af: afWeeks[i].bottles };
  });
  const afMonths = M.lastMonths(afEvents, 12);
  const months = M.lastMonths(alcFiltered, 12).map((m, i) => {
    const d = new Date(m.key + '-01T00:00:00');
    return { label: monthShortFmt.format(d).replace('.', ''), tip: monthFmt.format(d), value: m.bottles, af: afMonths[i].bottles };
  });
  const afWd = M.weekdayDistribution(M.filterEvents(afEvents, range));
  const wd = M.weekdayDistribution(inPeriod).map((w, i) => ({ label: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i], value: w.bottles, af: afWd[i].bottles }));
  const allSpend = M.spendingByMonth(state);
  const spendMonths = M.lastMonths([], 12).map((m) => {
    const d = new Date(m.key + '-01T00:00:00');
    return { label: monthShortFmt.format(d).replace('.', ''), tip: monthFmt.format(d), value: allSpend.get(m.key) || 0 };
  });

  const afSplit = M.filterEvents(all, range).reduce((acc, e) => {
    if (e.alcoholFree) acc.af += e.bottles; else acc.alc += e.bottles;
    return acc;
  }, { alc: 0, af: 0 });

  const favRating = M.favoritesByRating({ ...state, tastings: state.tastings.filter((t) => {
    if (range.from && t.ts < range.from) return false;
    const b = bmap.get(t.beerId);
    if (s.alc === 'alc' && M.isAlcoholFree(b)) return false;
    if (s.alc === 'af' && !M.isAlcoholFree(b)) return false;
    return true;
  }) }, { groupVariants: s.groupVariants }).slice(0, 5);
  const favCount = M.favoritesByConsumption(inPeriod, state.beers, { groupVariants: s.groupVariants }).slice(0, 5);
  const crates = M.crateSummary(state);
  const tile = (value, label) => h('div', { class: 'tile' }, h('strong', null, value), h('span', null, label));
  const variantLabel = (id) => {
    const name = beerName(id);
    return s.groupVariants && state.beers.some((b) => b.variantOf === id) ? `${name} (+ Varianten)` : name;
  };

  return h('div', { class: 'view stats' },
    h('header', { class: 'view-head' }, h('h1', null, 'Statistik')),
    h('div', { class: 'filters' },
      segmented([{ value: 'week', label: 'Woche' }, { value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }, { value: 'all', label: 'Alles' }],
        s.period, (v) => { s.period = v; render(); }, { small: true }),
      segmented([{ value: 'all', label: 'Alle' }, { value: 'alc', label: 'Alkoholisch' }, { value: 'af', label: 'Alkoholfrei' }],
        s.alc, (v) => { s.alc = v; render(); }, { small: true })),
    h('div', { class: 'tiles' },
      tile(String(sum.bottles), 'Bier'),
      tile(M.fmtLiters(sum.ml), 'Menge'),
      tile(`${M.fmtNumber(sum.grams, 0)} g`, 'Alkohol'),
      tile(`${M.fmtNumber(spendTotal / 100, 0)} €`, 'Ausgaben')),
    calendarCard(alcFiltered, s.alc === 'af' ? 'af' : 'alc'),
    barChart({ title: 'Konsum pro Woche (Flaschen)', data: weeks, series, stacked, labelEvery: 3 }),
    barChart({ title: 'Konsum pro Monat (Flaschen)', data: months, series, stacked, labelEvery: 2 }),
    barChart({ title: 'Wochentage (Flaschen, Zeitraum)', data: wd, series, stacked }),
    shareBar({ title: 'Alkoholfrei vs. alkoholisch (Zeitraum)', a: afSplit.alc, b: afSplit.af, labelA: 'alkoholisch', labelB: 'alkoholfrei', fmt: (n) => `${n} Fl` }),
    barChart({ title: 'Ausgaben pro Monat', data: spendMonths, series: 'alc', fmt: (c) => M.fmtEuro(c), labelEvery: 2 }),
    h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h3', null, 'Lieblingssorten'),
        toggle('Varianten zusammen', s.groupVariants, (v) => { s.groupVariants = v; render(); }).el),
      h('h4', null, 'nach Note'),
      favRating.length
        ? h('ol', { class: 'rank' }, favRating.map((f) => h('li', null, h('span', null, variantLabel(f.beerId)),
          h('span', { class: 'muted' }, `★ ${M.fmtNumber(f.avg, 1)} (${f.n}×)`))))
        : h('p', { class: 'muted' }, 'Noch keine Tastings.'),
      h('h4', null, 'nach Verbrauch'),
      favCount.length
        ? h('ol', { class: 'rank' }, favCount.map((f) => h('li', null, h('span', null, variantLabel(f.beerId)),
          h('span', { class: 'muted' }, `${f.bottles}× · ${M.fmtLiters(f.ml)}`))))
        : h('p', { class: 'muted' }, 'Noch nichts getrunken.')),
    placesCard(),
    h('section', { class: 'card' },
      h('h3', null, 'Kästen'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Ø Dauer bis leer'), h('dd', null, crates.avgDurationDays != null ? `${M.fmtNumber(crates.avgDurationDays, 1)} Tage (${crates.emptyCount} Kästen)` : '–'),
        h('dt', null, 'Ø Preis pro Flasche'), h('dd', null, M.fmtEuro(crates.avgPerBottle)),
        h('dt', null, 'Ø Preis pro Liter'), h('dd', null, M.fmtEuro(crates.avgPerLiter)))));
}

// ---------- Kalender ----------

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const monthLongFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayShortFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

function calendarCard(events, series) {
  const c = ui.cal;
  const totals = M.dailyTotals(events);
  const today = M.toDateKey(new Date());
  const isMonth = c.mode === 'month';
  const fromKey = isMonth ? M.toDateKey(new Date(c.year, c.month, 1)) : `${c.year}-01-01`;
  const toKey = isMonth ? M.toDateKey(new Date(c.year, c.month + 1, 0)) : `${c.year}-12-31`;
  // Erst ab dem ersten Eintrag zählen, sonst wirkt die Zeit vor der App wie eine lange Pause
  const firstKey = [...totals.keys()].sort()[0] || null;
  const effFrom = firstKey && firstKey > fromKey ? firstKey : fromKey;
  const sum = firstKey && effFrom <= toKey ? M.calendarSummary(totals, effFrom, toKey, today) : null;
  const tip = h('div', { class: 'cal-tip', role: 'status' }, 'Tag antippen für Details');

  const describe = (key) => {
    const d = totals.get(key);
    const label = dayShortFmt.format(M.parseDate(key));
    if (!d) return `${label}: kein Bier`;
    const af = d.af && d.alc ? ` (davon ${d.af} alkoholfrei)` : d.af ? ' (alkoholfrei)' : '';
    return `${label}: ${d.bottles} Bier · ${M.fmtLiters(d.ml)}${af}`;
  };
  const dayCell = (key, { small = false } = {}) => {
    if (!key) return h('span', { class: 'cal-day empty' });
    const d = totals.get(key);
    const level = M.calendarLevel(d?.bottles || 0);
    const future = key > today;
    return h('button', {
      type: 'button',
      class: `cal-day ${series} l${level}${key === today ? ' today' : ''}${future ? ' future' : ''}`,
      'aria-label': describe(key),
      disabled: future,
      onpointerenter: () => { tip.textContent = describe(key); },
      onfocus: () => { tip.textContent = describe(key); },
      onclick: () => { tip.textContent = describe(key); if (d) openDaySheet(key); },
    }, small ? '' : String(Number(key.slice(8))));
  };
  const monthBlock = (year, month, small) => h('div', { class: 'cal-month' + (small ? ' small' : '') },
    small ? h('button', { type: 'button', class: 'cal-month-title', onclick: () => { c.mode = 'month'; c.year = year; c.month = month; render(); } },
      monthShortFmt.format(new Date(year, month, 1)).replace('.', '')) : null,
    h('div', { class: 'cal-grid' },
      WEEKDAYS.map((w) => h('span', { class: 'cal-wd' }, small ? w[0] : w)),
      M.monthGrid(year, month).flat().map((key) => dayCell(key, { small }))));

  const shift = (dir) => {
    if (isMonth) {
      const d = new Date(c.year, c.month + dir, 1);
      c.year = d.getFullYear(); c.month = d.getMonth();
    } else c.year += dir;
    render();
  };
  const atEnd = isMonth ? (c.year > new Date().getFullYear() || (c.year === new Date().getFullYear() && c.month >= new Date().getMonth())) : c.year >= new Date().getFullYear();
  const legendCells = [0, 1, 2, 3, 4].map((l) => h('span', { class: `cal-day ${series} l${l} legend-cell`, 'aria-hidden': 'true' }));

  return h('section', { class: 'card cal' },
    h('div', { class: 'section-head' }, h('h3', null, 'Kalender'),
      segmented([{ value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }], c.mode, (v) => { c.mode = v; render(); }, { small: true })),
    h('div', { class: 'cal-nav' },
      h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'zurück', onclick: () => shift(-1) }, '‹'),
      h('strong', null, isMonth ? monthLongFmt.format(new Date(c.year, c.month, 1)) : String(c.year)),
      h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'weiter', disabled: atEnd, onclick: () => shift(1) }, '›')),
    isMonth ? monthBlock(c.year, c.month, false)
      : h('div', { class: 'cal-year' }, Array.from({ length: 12 }, (_, m) => monthBlock(c.year, m, true))),
    tip,
    h('div', { class: 'cal-foot' },
      h('span', { class: 'muted small' }, sum && sum.days > 0
        ? `${sum.active} von ${sum.days} Tagen · längste Pause ${sum.maxPause} ${sum.maxPause === 1 ? 'Tag' : 'Tage'}`
        : 'Keine Einträge in diesem Zeitraum'),
      h('span', { class: 'cal-legend', 'aria-label': 'Farbskala: 0, 1, 2, 3–4, 5 oder mehr Bier' },
        h('span', { class: 'muted small' }, '0'), legendCells, h('span', { class: 'muted small' }, '5+'))));
}

function openDaySheet(key) {
  const events = M.drinkEvents(state).filter((e) => M.toDateKey(e.ts) === key);
  const sum = M.sumEvents(events);
  const cmap = cratesById();
  const sheet = openSheet({
    title: dateLongFmt.format(M.parseDate(key)),
    body: [
      h('p', { class: 'muted' }, `${sum.bottles} Bier · ${M.fmtLiters(sum.ml)}${sum.grams ? ` · ${M.fmtNumber(sum.grams, 0)} g Alkohol` : ''}`),
      h('div', { class: 'card list' }, events.slice().reverse().map((e) => {
        const t = e.ref;
        const isTasting = e.kind === 'tasting';
        return h('button', {
          type: 'button', class: 'entry',
          onclick: () => { closeSheet(sheet); isTasting ? openTastingSheet({ tasting: t }) : openConsumptionSheet(t); },
        },
        h('span', { class: 'entry-icon' }, isTasting ? '★' : '🍺'),
        h('div', { class: 'entry-main' },
          h('div', { class: 'entry-title' }, h('strong', null, `${isTasting ? '' : `×${t.qty} `}${beerName(e.beerId)}`),
            isTasting && t.rating ? stars(t.rating, null, { size: 'sm', readonly: true }) : null),
          h('div', { class: 'entry-sub' }, isTasting ? [t.location ? `📍 ${t.location}` : null, (t.tags || []).join(', ')].filter(Boolean).join(' · ')
            : `aus Kasten vom ${fmtDay(cmap.get(t.crateId)?.purchaseDate)}`)),
        h('span', { class: 'entry-time' }, timeFmt.format(new Date(e.ts))));
      })),
    ],
  });
}

// ---------- Ansicht: Mehr ----------

function viewMore() {
  const sorted = [...state.beers].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => importJson(e.target.files?.[0]) });
  const tagInput = h('input', { type: 'text', value: tags().join(', ') });

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('h1', null, 'Mehr')),
    h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h3', null, `Sorten (${sorted.length})`),
        h('button', { type: 'button', class: 'btn small', onclick: () => openBeerSheet() }, '+ Sorte')),
      sorted.length
        ? h('div', { class: 'list' }, sorted.map((b) => h('button', { type: 'button', class: 'entry', onclick: () => openBeerSheet({ beer: b }) },
          b.photo ? h('img', { class: 'thumb', src: blobUrl(b.photo), alt: '' }) : h('span', { class: 'entry-icon' }, M.isAlcoholFree(b) ? '0,0' : '🍺'),
          h('div', { class: 'entry-main' },
            h('div', { class: 'entry-title' }, h('strong', null, b.name)),
            h('div', { class: 'entry-sub' }, beerSubtitle(b))))))
        : h('p', { class: 'muted' }, 'Noch keine Sorten.')),
    discoverCard(),
    alertSettingsCard(),
    h('section', { class: 'card' },
      h('h3', null, 'Tasting-Tags'),
      field('Kommagetrennt', tagInput),
      h('button', {
        type: 'button', class: 'btn small',
        onclick: async () => {
          const list = M.suggestions(tagInput.value.split(','));
          await saveMeta('tags', list.length ? list : M.DEFAULT_TAGS);
          toast('Tags gespeichert');
        },
      }, 'Tags speichern')),
    h('section', { class: 'card' },
      h('h3', null, 'Backup'),
      h('p', { class: 'muted' }, 'Alle Daten liegen nur auf diesem Gerät (im Browser-Speicher). Regelmäßig exportieren!'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: exportJson }, 'Export JSON (vollständig)'),
        h('button', { type: 'button', class: 'btn', onclick: exportCsv }, 'Export CSV (Einträge)'),
        h('button', { type: 'button', class: 'btn', onclick: () => importInput.click() }, 'Import JSON …')),
      importInput,
      state.meta.lastExport ? h('p', { class: 'muted' }, `Letzter Export: ${dayFmt.format(new Date(state.meta.lastExport))}`) : null),
    h('p', { class: 'muted center small' }, 'Beer Tracker · offline-fähige PWA'));
}

function discoverCard() {
  const earned = M.badges(state, findStyle).filter((b) => b.done).length;
  const places = M.placeStats(state).length;
  const item = (icon, title, sub, onclick) => h('button', { type: 'button', class: 'entry', onclick },
    h('span', { class: 'entry-icon' }, icon),
    h('div', { class: 'entry-main' }, h('div', { class: 'entry-title' }, h('strong', null, title)), h('div', { class: 'entry-sub' }, sub)),
    h('span', { class: 'muted' }, '›'));
  return h('section', { class: 'card list' },
    item('🏅', 'Erfolge & Bingo', `${earned} Abzeichen · Stil- und Länder-Bingo`, openBadgesSheet),
    item('📍', 'Orte', places ? `${places} ${places === 1 ? 'Ort' : 'Orte'} · wo trinke ich was` : 'Noch keine Orte erfasst', openPlacesSheet),
    item('📖', 'Bierstil-Lexikon', `${STYLE_LEXICON.length} Stile mit Foodpairing`, () => openLexiconSheet()));
}

// ---------- Orte ----------

function placesCard() {
  const places = M.placeStats(state);
  if (!places.length) return null;
  return h('section', { class: 'card' },
    h('div', { class: 'section-head' }, h('h3', null, 'Wo trinke ich was?'),
      h('button', { type: 'button', class: 'link', onclick: openPlacesSheet }, 'alle ›')),
    h('ol', { class: 'rank' }, places.slice(0, 5).map((p) => h('li', null,
      h('span', null, p.name, h('span', { class: 'muted small' }, ` · ${p.beers.slice(0, 2).map((x) => beerName(x.beerId)).join(', ')}`)),
      h('span', { class: 'muted' }, `${p.count}×${p.avgRating ? ` · ★ ${M.fmtNumber(p.avgRating, 1)}` : ''}`)))));
}

function openPlacesSheet() {
  const places = M.placeStats(state);
  const withCoords = places.filter((p) => p.lat != null);
  openSheet({
    title: 'Orte',
    body: [
      withCoords.length ? h('button', {
        type: 'button', class: 'btn wide',
        onclick: () => openMapSheet('Karte', withCoords.map((p) => ({
          lat: p.lat, lon: p.lon, title: p.name, sub: `${p.count}× verkostet`, onClick: () => openPlaceDetail(p),
        }))),
      }, `🗺️ Karte (${withCoords.length})`) : h('p', { class: 'muted small' }, 'Tipp: Beim Tasting „Außer Haus“ → „📍 Standort“ speichert den Ort für die Karte.'),
      places.length ? h('div', { class: 'card list' }, places.map((p) => h('button', { type: 'button', class: 'entry', onclick: () => openPlaceDetail(p) },
        h('span', { class: 'entry-icon' }, p.lat != null ? '📍' : '🏠'),
        h('div', { class: 'entry-main' },
          h('div', { class: 'entry-title' }, h('strong', null, p.name)),
          h('div', { class: 'entry-sub' }, `${p.count}× · ${p.beers.slice(0, 3).map((x) => beerName(x.beerId)).join(', ')}`)),
        h('span', { class: 'entry-time' }, p.avgRating ? `★ ${M.fmtNumber(p.avgRating, 1)}` : '')))) : emptyState('Noch keine Tastings außer Haus.', null),
    ],
  });
}

function openPlaceDetail(place) {
  const sheet = openSheet({
    title: place.name,
    body: [
      h('div', { class: 'card' }, h('dl', { class: 'kv' },
        h('dt', null, 'Besuche'), h('dd', null, String(place.count)),
        h('dt', null, 'Ø Note'), h('dd', null, place.avgRating ? `★ ${M.fmtNumber(place.avgRating, 1)}` : '–'),
        h('dt', null, 'Zuletzt'), h('dd', null, dayFmt.format(new Date(place.lastTs))),
        h('dt', null, 'Sorten'), h('dd', null, place.beers.map((x) => `${beerName(x.beerId)}${x.n > 1 ? ` (${x.n}×)` : ''}`).join(', ')))),
      place.lat != null ? h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => openMapSheet(place.name, [{ lat: place.lat, lon: place.lon, title: place.name }]) }, '🗺️ Karte'),
        h('a', { class: 'btn', href: osmLink(place.lat, place.lon), target: '_blank', rel: 'noopener' }, 'In OpenStreetMap öffnen')) : null,
      h('h3', { class: 'label' }, 'Tastings'),
      h('div', { class: 'card list' }, place.tastings.map((t) => h('button', {
        type: 'button', class: 'entry', onclick: () => { closeSheet(sheet); openTastingSheet({ tasting: t }); },
      }, t.photo ? h('img', { class: 'thumb', src: blobUrl(t.photo), alt: '' }) : h('span', { class: 'entry-icon' }, '★'),
      h('div', { class: 'entry-main' },
        h('div', { class: 'entry-title' }, h('strong', null, beerName(t.beerId)), t.rating ? stars(t.rating, null, { size: 'sm', readonly: true }) : null),
        h('div', { class: 'entry-sub' }, [(t.tags || []).join(', '), t.note].filter(Boolean).join(' · '))),
      h('span', { class: 'entry-time' }, fmtDay(M.toDateKey(t.ts)))))),
    ],
  });
}

// ---------- Erfolge & Bingo ----------

function bingoGrid(cells, render) {
  return h('div', { class: 'bingo' }, cells.map((c) => h('div', { class: 'bingo-cell' + (c.done ? ' done' : ''), title: render(c).title },
    h('span', { class: 'bingo-icon' }, render(c).icon), h('span', { class: 'bingo-label' }, render(c).label))));
}

function openBadgesSheet() {
  const list = M.badges(state, findStyle);
  const done = list.filter((b) => b.done).length;
  const sb = M.styleBingo(state, BINGO_STYLES, findStyle);
  const cb = M.countryBingo(state);
  const lex = new Map(STYLE_LEXICON.map((x) => [x.id, x]));
  const unknownCountry = state.beers.filter((b) => !b.country).length;
  const linesText = (cells) => {
    const n = M.bingoLines(cells);
    const k = cells.filter((c) => c.done).length;
    return `${k}/16 Felder${n ? ` · ${n} Bingo${n > 1 ? 's' : ''}! 🎉` : ''}`;
  };
  openSheet({
    title: 'Erfolge & Bingo',
    body: [
      h('section', { class: 'card' },
        h('div', { class: 'section-head' }, h('h3', null, 'Abzeichen'), h('span', { class: 'muted' }, `${done}/${list.length}`)),
        h('div', { class: 'badges' }, list.map((b) => h('div', { class: 'badge' + (b.done ? ' done' : '') },
          h('span', { class: 'badge-icon', 'aria-hidden': 'true' }, b.icon),
          h('strong', null, b.title),
          h('span', { class: 'muted small' }, b.desc),
          b.done ? h('span', { class: 'badge-ok' }, '✓ geschafft')
            : h('div', { class: 'progress', role: 'img', 'aria-label': `${b.value} von ${b.goal}` }, h('div', { style: { width: `${(b.value / b.goal) * 100}%` } })),
          b.done ? null : h('span', { class: 'muted small' }, `${b.value}/${b.goal}`))))),
      h('section', { class: 'card' },
        h('div', { class: 'section-head' }, h('h3', null, 'Stil-Bingo'), h('span', { class: 'muted small' }, linesText(sb))),
        bingoGrid(sb, (c) => {
          const st = lex.get(c.id);
          return { icon: c.done ? '✓' : '·', label: st.name, title: c.done ? c.beerIds.map(beerName).join(', ') : st.description };
        }),
        h('p', { class: 'muted small' }, 'Zählt, sobald eine Sorte des Stils getrunken wurde. Der Stil wird aus dem Feld „Stil“ der Sorte erkannt.')),
      h('section', { class: 'card' },
        h('div', { class: 'section-head' }, h('h3', null, 'Länder-Bingo'), h('span', { class: 'muted small' }, linesText(cb))),
        bingoGrid(cb, (c) => ({ icon: M.countryFlag(c.code), label: M.countryName(c.code), title: c.done ? c.beerIds.map(beerName).join(', ') : '' })),
        unknownCountry ? h('p', { class: 'muted small' }, `${unknownCountry} ${unknownCountry === 1 ? 'Sorte hat' : 'Sorten haben'} noch kein Land – unter Mehr → Sorten ergänzen.`) : null),
    ],
  });
}

// ---------- Bierstil-Lexikon ----------

function openLexiconSheet() {
  const listEl = h('div', { class: 'card list' });
  const search = h('input', { type: 'search', placeholder: 'Stil oder Speise suchen, z. B. „Käse“', class: 'search' });
  const renderList = () => {
    clear(listEl);
    const q = search.value.trim().toLowerCase();
    const items = STYLE_LEXICON.filter((st) => !q || [st.name, ...st.aliases, st.description, st.aroma, ...st.food].join(' ').toLowerCase().includes(q));
    if (!items.length) listEl.append(h('p', { class: 'muted center' }, 'Nichts gefunden.'));
    for (const st of items) {
      const mine = state.beers.filter((b) => findStyle(b.style)?.id === st.id).length;
      listEl.append(h('button', { type: 'button', class: 'entry', onclick: () => openStyleDetail(st) },
        h('div', { class: 'entry-main' },
          h('div', { class: 'entry-title' }, h('strong', null, st.name), h('span', { class: 'muted small' }, st.abv)),
          h('div', { class: 'entry-sub' }, `${st.group} · ${st.aroma}`)),
        mine ? h('span', { class: 'pill' }, `${mine}`) : h('span', { class: 'muted' }, '›')));
    }
  };
  search.addEventListener('input', renderList);
  renderList();
  openSheet({ title: 'Bierstil-Lexikon', body: [search, listEl] });
}

function openStyleDetail(st) {
  const mine = state.beers.filter((b) => findStyle(b.style)?.id === st.id);
  const ratings = M.favoritesByRating(state);
  const avgOf = (id) => ratings.find((r) => r.beerId === id)?.avg;
  openSheet({
    title: st.name,
    body: [
      h('p', null, st.description),
      h('div', { class: 'card' }, h('dl', { class: 'kv' },
        h('dt', null, 'Gärung'), h('dd', null, st.group),
        h('dt', null, 'Alkohol'), h('dd', null, st.abv),
        h('dt', null, 'Farbe'), h('dd', null, st.color),
        h('dt', null, 'Bittere'), h('dd', null, st.bitter),
        h('dt', null, 'Aroma'), h('dd', null, st.aroma),
        h('dt', null, 'Glas'), h('dd', null, st.glass),
        h('dt', null, 'Trinktemperatur'), h('dd', null, st.temp))),
      h('h3', { class: 'label' }, '🍽️ Passt gut zu'),
      h('div', { class: 'chips' }, st.food.map((f) => h('span', { class: 'chip static' }, f))),
      h('h3', { class: 'label' }, `Deine Sorten (${mine.length})`),
      mine.length ? h('div', { class: 'card list' }, mine.map((b) => h('div', { class: 'entry' },
        h('div', { class: 'entry-main' }, h('div', { class: 'entry-title' }, h('strong', null, b.name)), h('div', { class: 'entry-sub' }, beerSubtitle(b))),
        avgOf(b.id) ? h('span', { class: 'entry-time' }, `★ ${M.fmtNumber(avgOf(b.id), 1)}`) : null)))
        : h('p', { class: 'muted small' }, 'Noch keine Sorte mit diesem Stil.'),
      st.aliases.length ? h('p', { class: 'muted small' }, `Auch: ${st.aliases.join(', ')}`) : null,
    ],
  });
}

function alertSettingsCard() {
  const cur = alertSettings();
  const num = (v) => h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '365', value: String(v) });
  const low = num(cur.lowThreshold);
  const mhd = num(cur.mhdDays);
  const empty = num(cur.emptyDays);
  const nDismissed = (state.meta.dismissedAlerts || []).length;
  return h('section', { class: 'card stack' },
    h('h3', null, 'Hinweise'),
    h('div', { class: 'grid2' },
      field('„Fast leer“ ab (Flaschen)', low),
      field('MHD-Warnung (Tage vorher)', mhd)),
    field('Nachkauf nach leerem Kasten anzeigen (Tage)', empty),
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn small',
        onclick: async () => {
          const toInt = (el, d) => { const n = parseInt(el.value, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
          await saveMeta('alertSettings', {
            lowThreshold: toInt(low, M.DEFAULT_ALERT_SETTINGS.lowThreshold),
            mhdDays: toInt(mhd, M.DEFAULT_ALERT_SETTINGS.mhdDays),
            emptyDays: toInt(empty, M.DEFAULT_ALERT_SETTINGS.emptyDays),
          });
          toast('Einstellungen gespeichert');
        },
      }, 'Speichern'),
      nDismissed ? h('button', {
        type: 'button', class: 'btn small ghost',
        onclick: async () => { await saveMeta('dismissedAlerts', []); toast('Ausgeblendete Hinweise wieder sichtbar'); },
      }, `${nDismissed} ausgeblendete zeigen`) : null));
}

function beerSubtitle(b) {
  const variantOf = b.variantOf ? beersById().get(b.variantOf) : null;
  return [b.country ? `${M.countryFlag(b.country)} ${b.brewery || M.countryName(b.country)}` : b.brewery, b.style,
    M.isAlcoholFree(b) ? 'alkoholfrei' : (b.abv != null ? `${M.fmtNumber(b.abv)} %` : null),
    variantOf ? `Variante von ${variantOf.name}` : null].filter(Boolean).join(' · ');
}

// ---------- Sorten-Auswahl (Suche + neu anlegen) ----------

function beerPicker(initialId, onChange) {
  let selected = initialId || null;
  const wrap = h('div', { class: 'beer-picker' });
  const render = () => {
    clear(wrap);
    if (selected) {
      const b = beersById().get(selected);
      const abvMissing = b && !M.isAlcoholFree(b) && b.abv == null;
      wrap.append(h('div', { class: 'picked' },
        h('div', { class: 'picked-main' }, h('strong', null, b?.name || '?'), h('div', { class: 'muted small' }, b ? beerSubtitle(b) : ''),
          abvMissing ? h('div', { class: 'warn small' }, 'Alkoholgehalt fehlt') : null),
        h('div', { class: 'picked-actions' },
          b ? h('button', { type: 'button', class: 'link', onclick: () => openBeerSheet({ beer: b, onSaved: () => render() }) }, 'bearbeiten') : null,
          h('button', { type: 'button', class: 'link', onclick: () => { selected = null; onChange(null); render(); input.focus(); } }, 'ändern'))));
      return;
    }
    wrap.append(h('div', { class: 'search-row' }, input,
      h('button', { type: 'button', class: 'btn scan-btn', 'aria-label': 'Barcode scannen', onclick: () => scanForBeer(pick) }, '▥ Scan')), results);
    renderResults();
  };
  const results = h('div', { class: 'picker-results' });
  const input = h('input', { type: 'search', placeholder: 'Sorte suchen oder neu anlegen', autocomplete: 'off', oninput: () => renderResults() });
  const pick = (id) => { selected = id; onChange(id); render(); };
  function renderResults() {
    clear(results);
    const q = input.value.trim().toLowerCase();
    const matches = state.beers
      .filter((b) => !q || `${b.name} ${b.brewery || ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .slice(0, q ? 8 : 6);
    for (const b of matches) {
      results.append(h('button', { type: 'button', class: 'picker-item', onclick: () => pick(b.id) },
        h('span', null, b.name), h('span', { class: 'muted small' }, M.isAlcoholFree(b) ? 'alkoholfrei' : (b.brewery || ''))));
    }
    results.append(h('button', {
      type: 'button', class: 'picker-item new',
      onclick: () => openBeerSheet({ name: input.value.trim(), onSaved: (b) => pick(b.id) }),
    }, q ? `+ Neue Sorte „${input.value.trim()}“` : '+ Neue Sorte'));
  }
  render();
  return { el: wrap, get value() { return selected; } };
}

/** Barcode scannen → bekannte Sorte wählen oder neue Sorte mit Open-Food-Facts-Daten anlegen. */
async function scanForBeer(pick) {
  const ean = await scanBarcode();
  if (!ean) return;
  const known = state.beers.find((b) => b.ean === ean);
  if (known) { pick(known.id); toast(`${known.name} erkannt`); return; }
  let info = null;
  if (navigator.onLine !== false) {
    toast('Suche in Open Food Facts …', { duration: 8000 });
    try { info = await lookupOpenFoodFacts(ean); } catch { info = null; }
  }
  const prefill = { ean, name: info?.name || '', brewery: info?.brewery || '', abv: info?.abv ?? null };
  toast(info ? 'Daten aus Open Food Facts übernommen – bitte prüfen' : `EAN ${ean} nicht gefunden – bitte Sorte anlegen`);
  // Gibt es die Sorte schon ohne EAN? Dann nachfragen, ob sie verknüpft werden soll.
  const sameName = info?.name && state.beers.find((b) => !b.ean && M.placeKey(b.name) === M.placeKey(info.name));
  if (sameName && confirm(`„${sameName.name}“ gibt es schon. Barcode mit dieser Sorte verknüpfen?`)) {
    await save('beers', { ...sameName, ean });
    pick(sameName.id);
    return;
  }
  openBeerSheet({ prefill, onSaved: (b) => pick(b.id) });
}

// ---------- Sheet: Getrunken (Kastenauswahl, Menge, Zeit) ----------

function openDrinkSheet(preselect = null) {
  const open = M.openCrates(state);
  if (!open.length) return openCrateSheet();
  let crateId = preselect?.id || open[0].crate.id;
  let ts = null; // null = jetzt
  const qty = stepper(1, { min: 1, max: open.find((x) => x.crate.id === crateId)?.remaining || 1 });

  const crateList = h('div', { class: 'radio-list' }, open.map(({ crate, remaining }) => h('label', { class: 'radio' },
    h('input', {
      type: 'radio', name: 'crate', value: crate.id, checked: crate.id === crateId,
      onchange: () => { crateId = crate.id; qty.setMax(remaining); },
    }),
    h('span', null, beerName(crate.beerId)),
    h('span', { class: 'muted' }, `${remaining} übrig`))));

  const custom = h('input', { type: 'datetime-local', value: toLocalInput(nowIso()), hidden: true, onchange: (e) => { ts = fromLocalInput(e.target.value); } });
  const when = chips([{ value: 'now', label: 'Jetzt' }, { value: 'yesterday', label: 'Gestern Abend' }, { value: 'custom', label: '📅 Datum/Zeit' }], 'now', (v) => {
    custom.hidden = v !== 'custom';
    ts = v === 'yesterday' ? yesterdayEvening() : v === 'custom' ? fromLocalInput(custom.value) : null;
  });

  openSheet({
    title: 'Getrunken',
    saveLabel: 'Buchen',
    body: [
      h('h3', { class: 'label' }, 'Aus welchem Kasten?'), crateList,
      h('div', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Menge'), qty.el),
      h('h3', { class: 'label' }, 'Wann?'), when.el, custom,
    ],
    onSave: async () => {
      const crate = cratesById().get(crateId);
      if (!crate) return false;
      await bookConsumption(crate, qty.value, ts || nowIso());
    },
  });
}

// ---------- Sheet: Konsum-Eintrag bearbeiten ----------

function openConsumptionSheet(entry) {
  const crate = cratesById().get(entry.crateId);
  const maxQty = crate ? remainingOf(crate) + entry.qty : entry.qty;
  const qty = stepper(entry.qty, { min: 1, max: maxQty });
  const time = h('input', { type: 'datetime-local', value: toLocalInput(entry.ts) });
  openSheet({
    title: 'Eintrag bearbeiten',
    body: [
      h('p', null, h('strong', null, beerName(crate?.beerId)), h('span', { class: 'muted' }, ` · Kasten vom ${fmtDay(crate?.purchaseDate)}`)),
      h('div', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Menge'), qty.el),
      field('Zeitpunkt', time),
    ],
    footer: h('button', {
      type: 'button', class: 'btn danger wide',
      onclick: async () => { await remove('consumptions', entry.id); closeSheet(); toast('Eintrag gelöscht', { action: 'Rückgängig', onAction: () => save('consumptions', entry) }); },
    }, 'Eintrag löschen'),
    onSave: async () => {
      await save('consumptions', { ...entry, qty: qty.value, ml: qty.value * (crate?.unitMl || entry.ml / entry.qty), ts: fromLocalInput(time.value) });
    },
  });
}

// ---------- Sheet: Tasting ----------

function openTastingSheet({ tasting = null, beerId = null, crateId = null } = {}) {
  const t = tasting || {};
  const editing = !!tasting;
  const data = {
    beerId: t.beerId || beerId,
    rating: t.rating || 0,
    tags: t.tags || [],
    crateId: editing ? (t.crateId || null) : crateId,
    ml: t.ml || null,
  };

  const crateSelect = h('select', { 'aria-label': 'Kasten' });
  const crateField = field('Zum Kasten', crateSelect, 'Zählt als eine Flasche aus dem Kasten.');
  const sizeChips = chips(M.SERVING_SIZES.map((s) => ({ value: s.ml, label: s.label })), data.ml || M.DEFAULT_TASTING_ML, (v) => { data.ml = v; });
  const sizeField = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Menge (l)'), sizeChips.el);

  function refreshCrates({ autoselect = false } = {}) {
    clear(crateSelect);
    crateSelect.append(h('option', { value: '' }, '— kein Kasten —'));
    const candidates = state.crates.filter((c) => c.beerId === data.beerId && (remainingOf(c) > 0 || c.id === t.crateId));
    for (const c of candidates) {
      crateSelect.append(h('option', { value: c.id }, `Kasten vom ${fmtDay(c.purchaseDate)} · ${remainingOf(c)} übrig`));
    }
    if (autoselect) data.crateId = candidates.find((c) => remainingOf(c) > 0)?.id || null;
    if (data.crateId && !candidates.some((c) => c.id === data.crateId)) data.crateId = null;
    crateSelect.value = data.crateId || '';
    syncVisibility();
  }
  crateSelect.addEventListener('change', () => { data.crateId = crateSelect.value || null; syncVisibility(); });

  const picker = beerPicker(data.beerId, (id) => { data.beerId = id; refreshCrates({ autoselect: !editing }); });

  const locations = M.suggestions(state.tastings.map((x) => x.location));
  const locInput = h('input', { type: 'text', list: 'dl-locations', placeholder: 'z. B. Biergarten am See', value: t.location || '' });
  let coords = typeof t.lat === 'number' ? { lat: t.lat, lon: t.lon } : null;
  const gpsStatus = h('span', { class: 'muted small' });
  const gpsBtn = h('button', { type: 'button', class: 'btn small ghost' }, '📍 Standort');
  const syncGps = () => {
    gpsStatus.textContent = coords ? 'Standort gespeichert' : '';
    gpsBtn.textContent = coords ? '📍 entfernen' : '📍 Standort';
  };
  gpsBtn.addEventListener('click', async () => {
    if (coords) { coords = null; syncGps(); return; }
    gpsStatus.textContent = 'Standort wird ermittelt …';
    try {
      const pos = await getPosition();
      coords = { lat: pos.lat, lon: pos.lon };
      syncGps();
      const near = M.nearestPlace(state, pos.lat, pos.lon);
      if (near && !locInput.value.trim()) {
        locInput.value = near.name;
        gpsStatus.textContent = `Bekannter Ort erkannt: ${near.name}`;
      }
    } catch (err) {
      gpsStatus.textContent = err.message;
    }
  });
  syncGps();
  const locField = field('Ort', h('div', { class: 'stack-sm' }, locInput, datalist('dl-locations', locations),
    h('div', { class: 'gps-row' }, gpsBtn, gpsStatus)));
  const away = toggle('Außer Haus', !!t.location, () => syncVisibility());

  function syncVisibility() {
    const isAway = away.input.checked;
    locField.hidden = !isAway;
    crateField.hidden = isAway;
    sizeField.hidden = !isAway && !!data.crateId;
  }

  const note = h('textarea', { rows: 2, placeholder: 'Notiz (optional)', value: t.note || '' });
  const photo = photoField(t.photo);
  const price = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00', value: t.price != null ? (t.price / 100).toFixed(2).replace('.', ',') : '' });
  const time = h('input', { type: 'datetime-local', value: toLocalInput(t.ts || nowIso()) });

  const details = h('details', { class: 'more', open: editing && (t.crateId || t.price != null) ? true : null },
    h('summary', null, 'Mehr: Kasten, Menge, Preis, Zeit'),
    crateField, sizeField, field('Preis (€)', price), field('Zeitpunkt', time));

  refreshCrates({ autoselect: !editing && !crateId });

  openSheet({
    title: editing ? 'Tasting bearbeiten' : 'Neues Tasting',
    saveLabel: 'Fertig',
    body: [
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sorte'), picker.el),
      stars(data.rating, (v) => { data.rating = v; }),
      chips(tags(), data.tags, (v) => { data.tags = v; }, { multi: true }).el,
      note,
      photo.el,
      away.el,
      locField,
      details,
    ],
    footer: editing ? h('button', {
      type: 'button', class: 'btn danger wide',
      onclick: async () => {
        if (!confirm('Tasting löschen?')) return;
        await remove('tastings', tasting.id);
        closeSheet();
        toast('Tasting gelöscht', { action: 'Rückgängig', onAction: () => save('tastings', tasting) });
      },
    }, 'Tasting löschen') : null,
    onSave: async () => {
      if (!data.beerId) { alert('Bitte eine Sorte wählen.'); return false; }
      const isAway = away.input.checked;
      const linkedCrate = !isAway && data.crateId ? cratesById().get(data.crateId) : null;
      const rec = {
        id: t.id || db.uid(),
        beerId: data.beerId,
        ts: fromLocalInput(time.value),
        rating: data.rating || null,
        tags: data.tags,
        note: note.value.trim(),
        photo: photo.value,
        location: isAway ? locInput.value.trim() : '',
        lat: isAway && coords ? coords.lat : null,
        lon: isAway && coords ? coords.lon : null,
        crateId: linkedCrate ? linkedCrate.id : null,
        ml: linkedCrate ? linkedCrate.unitMl : (data.ml || M.DEFAULT_TASTING_ML),
        price: M.parseEuro(price.value),
        createdAt: t.createdAt || nowIso(),
      };
      await save('tastings', rec);
      if (!editing) toast(`Tasting ${beerName(rec.beerId)} gespeichert`, { action: 'Rückgängig', onAction: () => remove('tastings', rec.id) });
    },
  });
}

// ---------- Sheet: Kasten ----------

function openCrateSheet({ crate = null, beerId = null, template = null } = {}) {
  // Nachkauf: Gebinde, Anzahl, Preis und Händler vom letzten Kasten übernehmen (ohne Daten/ID)
  const c = crate || (template ? {
    beerId: template.beerId, packaging: template.packaging, count: template.count,
    unitMl: template.unitMl, price: template.price, store: template.store,
  } : {});
  const editing = !!crate;
  const data = { beerId: c.beerId || beerId, packaging: c.packaging || 'k20x05' };
  const initialPack = M.packagingByKey(data.packaging) || M.PACKAGINGS[0];

  const count = h('input', { type: 'number', inputmode: 'numeric', min: '1', value: String(c.count || initialPack.count) });
  const unit = h('input', { type: 'text', inputmode: 'decimal', value: String((c.unitMl || initialPack.unitMl) / 1000).replace('.', ',') });
  const packChips = chips(M.PACKAGINGS.map((p) => ({ value: p.key, label: p.label })), data.packaging, (key) => {
    data.packaging = key;
    const p = M.packagingByKey(key);
    if (p) { count.value = String(p.count); unit.value = String(p.unitMl / 1000).replace('.', ','); }
  });
  const price = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00', value: c.price != null ? (c.price / 100).toFixed(2).replace('.', ',') : '' });
  const purchase = h('input', { type: 'date', value: c.purchaseDate || M.toDateKey(new Date()) });
  const bestBefore = h('input', { type: 'date', value: c.bestBefore || '' });
  const storeInput = h('input', { type: 'text', list: 'dl-stores', placeholder: 'z. B. Rewe', value: c.store || '' });
  const stores = M.suggestions(state.crates.map((x) => x.store));
  const withTasting = toggle('Gleich ein Tasting erfassen', false);

  const syncTastingDefault = () => {
    withTasting.input.checked = !!data.beerId && !state.tastings.some((t) => t.beerId === data.beerId);
  };
  const picker = beerPicker(data.beerId, (id) => { data.beerId = id; syncTastingDefault(); });
  syncTastingDefault();

  openSheet({
    title: editing ? 'Kasten bearbeiten' : 'Neuer Kasten',
    body: [
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sorte'), picker.el),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Gebinde'), packChips.el),
      h('div', { class: 'grid2' }, field('Anzahl', count), field('Inhalt je Flasche (l)', unit)),
      h('div', { class: 'grid2' }, field('Preis (€)', price, 'ohne Pfand'), field('Kaufdatum', purchase)),
      h('div', { class: 'grid2' }, field('MHD', bestBefore), field('Händler', h('div', null, storeInput, datalist('dl-stores', stores)))),
      editing ? null : withTasting.el,
    ],
    footer: editing ? h('button', { type: 'button', class: 'btn danger wide', onclick: () => deleteCrate(crate) }, 'Kasten löschen') : null,
    onSave: async () => {
      if (!data.beerId) { alert('Bitte eine Sorte wählen.'); return false; }
      const n = parseInt(count.value, 10);
      const unitL = M.parseDecimal(unit.value);
      if (!n || n < 1) { alert('Bitte eine gültige Anzahl angeben.'); return false; }
      if (!unitL || unitL <= 0) { alert('Bitte den Inhalt je Flasche angeben.'); return false; }
      const rec = {
        id: c.id || db.uid(),
        beerId: data.beerId,
        purchaseDate: purchase.value || M.toDateKey(new Date()),
        count: n,
        unitMl: Math.round(unitL * 1000),
        packaging: data.packaging,
        price: M.parseEuro(price.value),
        bestBefore: bestBefore.value || null,
        store: storeInput.value.trim(),
        createdAt: c.createdAt || nowIso(),
      };
      // Bestehende Konsum-Einträge an geänderte Flaschengröße anpassen
      if (editing && rec.unitMl !== crate.unitMl) {
        const ops = state.consumptions.filter((x) => x.crateId === rec.id).map((x) => ({ ...x, ml: x.qty * rec.unitMl }));
        await db.batch(ops.map((x) => ({ store: 'consumptions', put: x })));
        for (const x of ops) Object.assign(state.consumptions.find((y) => y.id === x.id), x);
      }
      await save('crates', rec);
      if (!editing) {
        toast(`Kasten ${beerName(rec.beerId)} angelegt`);
        if (withTasting.input.checked) setTimeout(() => openTastingSheet({ beerId: rec.beerId, crateId: rec.id }), 250);
      }
    },
  });
}

async function deleteCrate(crate) {
  const nCons = state.consumptions.filter((x) => x.crateId === crate.id).length;
  const linked = state.tastings.filter((x) => x.crateId === crate.id);
  if (!confirm(`Kasten löschen? ${nCons} Konsum-Einträge werden mitgelöscht.` + (linked.length ? ` ${linked.length} Tasting(s) bleiben erhalten.` : ''))) return;
  const ops = [
    { store: 'crates', del: crate.id },
    ...state.consumptions.filter((x) => x.crateId === crate.id).map((x) => ({ store: 'consumptions', del: x.id })),
    ...linked.map((x) => ({ store: 'tastings', put: { ...x, crateId: null } })),
  ];
  await db.batch(ops);
  state.crates = state.crates.filter((x) => x.id !== crate.id);
  state.consumptions = state.consumptions.filter((x) => x.crateId !== crate.id);
  state.tastings = state.tastings.map((x) => (x.crateId === crate.id ? { ...x, crateId: null } : x));
  closeAllSheets();
  render();
  toast('Kasten gelöscht');
}

// ---------- Sheet: Kasten-Detail ----------

function openCrateDetail(crate) {
  const rest = remainingOf(crate);
  const cons = state.consumptions.filter((x) => x.crateId === crate.id).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const linked = state.tastings.filter((x) => x.crateId === crate.id);
  const ppb = M.cratePricePerBottle(crate);
  const ppl = M.cratePricePerLiter(crate);
  const dur = M.crateDurationDays(crate, state.consumptions, state.tastings);
  const pack = M.packagingByKey(crate.packaging)?.label || `${crate.count}×${M.fmtMl(crate.unitMl)}`;

  const sheet = openSheet({
    title: beerName(crate.beerId),
    body: [
      h('div', { class: 'card' },
        h('div', { class: 'crate-main' }, h('strong', null, rest ? `${rest} von ${crate.count} übrig` : 'Leer – abgeschlossen'),
          rest ? h('button', { type: 'button', class: 'btn small primary', onclick: () => { closeSheet(sheet); bookConsumption(crate); } }, '+1') : null),
        rest ? progress(rest, crate.count) : null,
        h('dl', { class: 'kv' },
          h('dt', null, 'Gebinde'), h('dd', null, `${pack} (${crate.count}×${M.fmtMl(crate.unitMl)})`),
          h('dt', null, 'Gekauft'), h('dd', null, [fmtDay(crate.purchaseDate), crate.store].filter(Boolean).join(' · ')),
          h('dt', null, 'MHD'), h('dd', null, fmtDay(crate.bestBefore)),
          h('dt', null, 'Preis'), h('dd', null, crate.price != null ? `${M.fmtEuro(crate.price)} · ${M.fmtEuro(ppb)}/Fl · ${M.fmtEuro(ppl)}/l` : '–'),
          dur != null ? [h('dt', null, 'Dauer'), h('dd', null, `${dur} ${dur === 1 ? 'Tag' : 'Tage'} bis leer`)] : null)),
      h('div', { class: 'btn-row' },
        rest ? h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(sheet); openDrinkSheet(crate); } }, 'Mehrere / nachtragen') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(sheet); openTastingSheet({ beerId: crate.beerId, crateId: rest ? crate.id : null }); } }, '★ Tasting'),
        h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(sheet); openCrateSheet({ crate }); } }, 'Bearbeiten')),
      linked.length ? [h('h3', { class: 'label' }, 'Tastings'), h('div', { class: 'card list' }, linked.map((t) => h('button', {
        type: 'button', class: 'entry', onclick: () => { closeSheet(sheet); openTastingSheet({ tasting: t }); },
      }, h('span', { class: 'entry-icon' }, '★'),
      h('div', { class: 'entry-main' }, h('div', { class: 'entry-title' }, t.rating ? stars(t.rating, null, { size: 'sm', readonly: true }) : 'ohne Note'),
        h('div', { class: 'entry-sub' }, (t.tags || []).join(', '))),
      h('span', { class: 'entry-time' }, fmtDay(M.toDateKey(t.ts))))))] : null,
      h('h3', { class: 'label' }, `Getrunken (${cons.reduce((a, b) => a + b.qty, 0) + linked.length})`),
      cons.length ? h('div', { class: 'card list' }, cons.map((x) => h('button', {
        type: 'button', class: 'entry', onclick: () => { closeSheet(sheet); openConsumptionSheet(x); },
      }, h('span', { class: 'entry-icon' }, '🍺'), h('div', { class: 'entry-main' }, `×${x.qty}`),
      h('span', { class: 'entry-time' }, `${dateFmt.format(new Date(x.ts))} ${timeFmt.format(new Date(x.ts))}`)))) : h('p', { class: 'muted' }, 'Noch nichts.'),
    ],
  });
}

// ---------- Sheet: Sorte ----------

function openBeerSheet({ beer = null, name = '', prefill = null, onSaved = null } = {}) {
  const b = beer || prefill || {};
  const editing = !!beer;
  const nameInput = h('input', { type: 'text', placeholder: 'z. B. Radeberger Pilsner', value: b.name || name });
  const brewery = h('input', { type: 'text', list: 'dl-breweries', value: b.brewery || '' });
  const style = h('input', { type: 'text', list: 'dl-styles', value: b.style || '' });
  const styleInfo = h('div', { class: 'style-info' });
  const syncStyleInfo = () => {
    clear(styleInfo);
    const st = findStyle(style.value);
    if (st) {
      styleInfo.append(h('button', { type: 'button', class: 'link small', onclick: () => openStyleDetail(st) },
        `ℹ️ ${st.name}: ${st.abv}, ${st.bitter} – Lexikon & Foodpairing`));
    }
  };
  style.addEventListener('input', syncStyleInfo);
  syncStyleInfo();
  const country = h('select', { value: b.country || '' },
    h('option', { value: '' }, '— unbekannt —'),
    [...M.COUNTRIES].sort((x, y) => x.name.localeCompare(y.name, 'de')).map((c) => h('option', { value: c.code }, `${M.countryFlag(c.code)} ${c.name}`)));
  const ean = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'für den Barcode-Scan', value: b.ean || '' });
  const eanScan = h('button', {
    type: 'button', class: 'btn scan-btn', 'aria-label': 'Barcode scannen',
    onclick: async () => { const code = await scanBarcode(); if (code) ean.value = code; },
  }, '▥ Scan');
  const abv = h('input', { type: 'text', inputmode: 'decimal', placeholder: '4,9', value: b.abv != null && !b.alcoholFree ? String(b.abv).replace('.', ',') : '' });
  if (editing && b.abv == null && !b.alcoholFree) setTimeout(() => abv.focus(), 300);
  const abvField = field('Alkohol (% vol)', abv);
  const af = toggle('Alkoholfrei', !!b.alcoholFree, (v) => { abvField.hidden = v; });
  abvField.hidden = !!b.alcoholFree;
  const variant = h('select', { value: b.variantOf || '' },
    h('option', { value: '' }, '— keine —'),
    state.beers.filter((x) => x.id !== b.id && !x.variantOf).sort((x, y) => x.name.localeCompare(y.name, 'de'))
      .map((x) => h('option', { value: x.id }, x.name)));
  const photo = photoField(b.photo);
  const breweries = M.suggestions(state.beers.map((x) => x.brewery));
  const styles = M.suggestions([...state.beers.map((x) => x.style), ...STYLES]);

  const used = editing && (state.crates.some((c) => c.beerId === b.id) || state.tastings.some((t) => t.beerId === b.id));

  openSheet({
    title: editing ? 'Sorte bearbeiten' : 'Neue Sorte',
    body: [
      field('Name', nameInput),
      field('Brauerei', h('div', null, brewery, datalist('dl-breweries', breweries))),
      field('Stil', h('div', null, style, datalist('dl-styles', styles), styleInfo)),
      field('Land', country),
      af.el,
      abvField,
      field('Variante von', variant, 'z. B. „alkoholfreie Variante von …“ – für gemeinsame Auswertung'),
      field('EAN / Barcode', h('div', { class: 'search-row' }, ean, eanScan)),
      photo.el,
    ],
    footer: editing ? h('button', {
      type: 'button', class: 'btn danger wide',
      onclick: async () => {
        if (used) { alert('Diese Sorte hat noch Kästen oder Tastings und kann nicht gelöscht werden.'); return; }
        if (!confirm(`Sorte „${b.name}“ löschen?`)) return;
        await remove('beers', b.id);
        closeSheet();
      },
    }, 'Sorte löschen') : null,
    onSave: async () => {
      const n = nameInput.value.trim();
      if (!n) { alert('Bitte einen Namen eingeben.'); return false; }
      const isAf = af.input.checked;
      const code = ean.value.replace(/\D/g, '') || null;
      const dupe = code && state.beers.find((x) => x.ean === code && x.id !== b.id);
      if (dupe) { alert(`Dieser Barcode gehört schon zu „${dupe.name}“.`); return false; }
      const rec = {
        ...(editing ? b : {}),
        id: (editing && b.id) || db.uid(),
        name: n,
        brewery: brewery.value.trim(),
        style: style.value.trim(),
        alcoholFree: isAf,
        abv: isAf ? 0 : M.parseDecimal(abv.value),
        variantOf: variant.value || null,
        country: country.value || null,
        ean: code,
        photo: photo.value,
        createdAt: (editing && b.createdAt) || nowIso(),
      };
      await save('beers', rec);
      onSaved?.(rec);
    },
  });
  if (!editing) setTimeout(() => nameInput.focus(), 250);
}

// ---------- Export / Import ----------

function download(filename, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url) {
  return (await fetch(url)).blob();
}

async function withPhotos(list, fn) {
  return Promise.all(list.map(async (x) => (x.photo ? { ...x, photo: await fn(x.photo) } : x)));
}

async function exportJson() {
  const data = {
    app: 'beer-tracker',
    version: 1,
    exportedAt: nowIso(),
    beers: await withPhotos(state.beers, blobToDataUrl),
    crates: state.crates,
    consumptions: state.consumptions,
    tastings: await withPhotos(state.tastings, blobToDataUrl),
    meta: state.meta,
  };
  download(`beer-backup-${M.toDateKey(new Date())}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  await saveMeta('lastExport', nowIso());
}

function exportCsv() {
  // BOM, damit Excel UTF-8 erkennt
  download(`beer-eintraege-${M.toDateKey(new Date())}.csv`, new Blob(['﻿' + M.eventsToCsv(state)], { type: 'text/csv;charset=utf-8' }));
}

async function importJson(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'beer-tracker') throw new Error('Keine Beer-Tracker-Sicherung.');
    const counts = `${data.beers?.length || 0} Sorten, ${data.crates?.length || 0} Kästen, ${(data.consumptions?.length || 0) + (data.tastings?.length || 0)} Einträge`;
    if (!confirm(`Backup importieren (${counts})? Die aktuellen Daten auf diesem Gerät werden ersetzt.`)) return;
    const restored = {
      beers: await withPhotos(data.beers || [], dataUrlToBlob),
      crates: data.crates || [],
      consumptions: data.consumptions || [],
      tastings: await withPhotos(data.tastings || [], dataUrlToBlob),
      meta: data.meta || {},
    };
    await db.replaceAll(restored);
    Object.assign(state, restored);
    render();
    toast('Backup importiert');
  } catch (err) {
    alert(`Import fehlgeschlagen: ${err.message}`);
  }
}

// ---------- Start ----------

async function init() {
  try {
    Object.assign(state, await db.loadAll());
  } catch (err) {
    document.getElementById('view').textContent = `Speicher nicht verfügbar: ${err.message}`;
    return;
  }
  render();
  db.requestPersistence();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('Neue Version verfügbar', { action: 'Neu laden', onAction: () => location.reload(), duration: 15000 });
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
