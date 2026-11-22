import * as db from './db.js';
import * as M from './model.js';
import {
  h, clear, openSheet, closeSheet, closeAllSheets, toast, field, toggle, segmented, chips, stars,
  stepper, datalist, blobUrl, photoField, barChart, shareBar,
} from './ui.js';

const state = { beers: [], crates: [], consumptions: [], tastings: [], meta: {} };
const ui = {
  stockTab: 'open',
  history: { q: '', kind: 'all', minRating: 0, period: 'all', beerId: '', brewery: '' },
  stats: { period: 'month', alc: 'all', groupVariants: false },
};

const STYLES = ['Pils', 'Helles', 'Export', 'Weißbier', 'Dunkles', 'Märzen', 'Bock', 'Kellerbier', 'Lager',
  'Radler', 'IPA', 'Pale Ale', 'Stout', 'Porter', 'Kölsch', 'Alt', 'Zwickel', 'Rauchbier', 'Sour'];

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
    h('section', { class: 'card' },
      h('h3', null, 'Kästen'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Ø Dauer bis leer'), h('dd', null, crates.avgDurationDays != null ? `${M.fmtNumber(crates.avgDurationDays, 1)} Tage (${crates.emptyCount} Kästen)` : '–'),
        h('dt', null, 'Ø Preis pro Flasche'), h('dd', null, M.fmtEuro(crates.avgPerBottle)),
        h('dt', null, 'Ø Preis pro Liter'), h('dd', null, M.fmtEuro(crates.avgPerLiter)))));
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
  return [b.brewery, b.style, M.isAlcoholFree(b) ? 'alkoholfrei' : (b.abv != null ? `${M.fmtNumber(b.abv)} %` : null),
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
      wrap.append(h('div', { class: 'picked' },
        h('div', null, h('strong', null, b?.name || '?'), h('div', { class: 'muted small' }, b ? beerSubtitle(b) : '')),
        h('button', { type: 'button', class: 'link', onclick: () => { selected = null; onChange(null); render(); input.focus(); } }, 'ändern')));
      return;
    }
    wrap.append(input, results);
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
  const locField = field('Ort', h('div', null, locInput, datalist('dl-locations', locations)));
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

function openBeerSheet({ beer = null, name = '', onSaved = null } = {}) {
  const b = beer || {};
  const editing = !!beer;
  const nameInput = h('input', { type: 'text', placeholder: 'z. B. Radeberger Pilsner', value: b.name || name });
  const brewery = h('input', { type: 'text', list: 'dl-breweries', value: b.brewery || '' });
  const style = h('input', { type: 'text', list: 'dl-styles', value: b.style || '' });
  const abv = h('input', { type: 'text', inputmode: 'decimal', placeholder: '4,9', value: b.abv != null && !b.alcoholFree ? String(b.abv).replace('.', ',') : '' });
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
      field('Stil', h('div', null, style, datalist('dl-styles', styles))),
      af.el,
      abvField,
      field('Variante von', variant, 'z. B. „alkoholfreie Variante von …“ – für gemeinsame Auswertung'),
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
      const rec = {
        id: b.id || db.uid(),
        name: n,
        brewery: brewery.value.trim(),
        style: style.value.trim(),
        alcoholFree: isAf,
        abv: isAf ? 0 : M.parseDecimal(abv.value),
        variantOf: variant.value || null,
        photo: photo.value,
        createdAt: b.createdAt || nowIso(),
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
