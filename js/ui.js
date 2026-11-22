// DOM-Helfer: Element-Fabrik, Sheets, Toast, Diagramme, Foto-Feld.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false || k === 'value') continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  // value erst nach den Kindern setzen (select braucht seine options, textarea den Property-Weg)
  if (attrs && attrs.value != null) el.value = attrs.value;
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// ---------- Sheets (Vollbild von unten, stapelbar) ----------

const sheetStack = [];

export function openSheet({ title, body, saveLabel = 'Speichern', onSave = null, footer = null, onClose = null }) {
  const root = document.getElementById('sheets');
  const saveBtn = onSave
    ? h('button', { class: 'sheet-save', type: 'button' }, saveLabel)
    : h('span', { class: 'sheet-save-spacer' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'sheet-head' },
      h('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Schließen', onclick: () => closeSheet() }, '✕'),
      h('h2', null, title),
      saveBtn),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('div', { class: 'sheet-foot' }, footer) : null);
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: () => closeSheet() });
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, sheet);
  root.append(wrap);
  document.body.classList.add('sheet-open');
  const entry = { wrap, onSave, onClose };
  sheetStack.push(entry);
  if (onSave) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        const ok = await onSave();
        if (ok !== false) closeSheet(entry);
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
  requestAnimationFrame(() => wrap.classList.add('in'));
  return entry;
}

export function closeSheet(entry = sheetStack[sheetStack.length - 1]) {
  if (!entry) return;
  const i = sheetStack.indexOf(entry);
  if (i === -1) return;
  sheetStack.splice(i, 1);
  try { entry.onClose?.(); } catch { /* ignorieren */ }
  entry.wrap.classList.remove('in');
  setTimeout(() => entry.wrap.remove(), 200);
  if (!sheetStack.length) document.body.classList.remove('sheet-open');
}

export function closeAllSheets() {
  while (sheetStack.length) closeSheet();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetStack.length) closeSheet();
});

// ---------- Toast mit Aktion ----------

let toastTimer = null;

export function toast(message, { action = null, onAction = null, duration = 5000 } = {}) {
  const root = document.getElementById('toast');
  clear(root);
  root.append(h('span', null, message));
  if (action) {
    root.append(h('button', {
      type: 'button',
      onclick: () => { hideToast(); onAction?.(); },
    }, action));
  }
  root.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  document.getElementById('toast').classList.remove('show');
}

// ---------- Formular-Bausteine ----------

export function field(label, control, hint = null) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function toggle(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: (e) => onChange?.(e.target.checked) });
  return { el: h('label', { class: 'toggle' }, h('span', null, label), input, h('span', { class: 'switch', 'aria-hidden': 'true' })), input };
}

/** Segment-Auswahl: options = [{value,label}] */
export function segmented(options, value, onChange, { small = false } = {}) {
  const el = h('div', { class: 'segmented' + (small ? ' small' : ''), role: 'tablist' });
  const render = (v) => {
    clear(el);
    for (const o of options) {
      el.append(h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(o.value === v),
        class: o.value === v ? 'active' : '',
        onclick: () => { render(o.value); onChange(o.value); },
      }, o.label));
    }
  };
  render(value);
  return el;
}

/** Chips zum Antippen. multi=true → Mehrfachauswahl (Set). */
export function chips(options, selected, onChange, { multi = false } = {}) {
  const el = h('div', { class: 'chips' });
  let sel = multi ? new Set(selected || []) : selected;
  const render = () => {
    clear(el);
    for (const o of options) {
      const value = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      const on = multi ? sel.has(value) : sel === value;
      el.append(h('button', {
        type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on),
        onclick: () => {
          if (multi) { sel.has(value) ? sel.delete(value) : sel.add(value); onChange([...sel]); }
          else { sel = sel === value ? null : value; onChange(sel); }
          render();
        },
      }, label));
    }
  };
  render();
  return { el, set(v) { sel = multi ? new Set(v) : v; render(); } };
}

export function stars(value, onChange, { size = 'lg', readonly = false } = {}) {
  const el = h('div', { class: `stars ${size}`, role: readonly ? 'img' : 'radiogroup', 'aria-label': `${value || 0} von 5 Sternen` });
  let v = value || 0;
  const render = () => {
    clear(el);
    for (let i = 1; i <= 5; i++) {
      const on = i <= v;
      if (readonly) el.append(h('span', { class: on ? 'on' : '' }, on ? '★' : '☆'));
      else el.append(h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(i === v), 'aria-label': `${i} Sterne`,
        class: on ? 'on' : '',
        onclick: () => { v = v === i ? 0 : i; render(); onChange?.(v); },
      }, on ? '★' : '☆'));
    }
  };
  render();
  return el;
}

export function stepper(value, { min = 1, max = 99, onChange } = {}) {
  let v = value;
  const out = h('output', null, String(v));
  const set = (n) => { v = Math.max(min, Math.min(max, n)); out.textContent = String(v); onChange?.(v); };
  const el = h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'weniger', onclick: () => set(v - 1) }, '−'),
    out,
    h('button', { type: 'button', 'aria-label': 'mehr', onclick: () => set(v + 1) }, '+'));
  return { el, get value() { return v; }, setMax(m) { max = m; set(v); } };
}

export function datalist(id, values) {
  return h('datalist', { id }, values.map((v) => h('option', { value: v })));
}

// ---------- Fotos ----------

const urlCache = new WeakMap();

export function blobUrl(blob) {
  if (!blob) return null;
  if (!urlCache.has(blob)) urlCache.set(blob, URL.createObjectURL(blob));
  return urlCache.get(blob);
}

export async function resizeImage(file, max = 1200) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return await new Promise((r) => canvas.toBlob((b) => r(b || file), 'image/jpeg', 0.82));
  } catch {
    return file;
  }
}

export function photoField(initial) {
  let blob = initial || null;
  const preview = h('div', { class: 'photo-preview' });
  const input = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      blob = await resizeImage(f);
      render();
    },
  });
  const render = () => {
    clear(preview);
    if (blob) {
      preview.append(
        h('img', { src: blobUrl(blob), alt: 'Foto' }),
        h('button', { type: 'button', class: 'link danger', onclick: () => { blob = null; input.value = ''; render(); } }, 'Foto entfernen'));
    } else {
      preview.append(h('button', { type: 'button', class: 'btn ghost', onclick: () => input.click() }, '📷 Foto'));
    }
  };
  render();
  return { el: h('div', { class: 'photo-field' }, preview, input), get value() { return blob; } };
}

// ---------- Diagramme ----------

/**
 * Säulendiagramm mit Hover/Tap-Tooltip und Tabellenansicht.
 * data = [{label, tip, value, af?}] – ist `stacked` gesetzt, wird `af` (Anteil alkoholfrei)
 * unten blau und der Rest darüber in Bernstein gestapelt.
 * series = 'alc' | 'af' für einfarbige Darstellung.
 */
export function barChart({ title, data, fmt = String, series = 'alc', labelEvery = 1, stacked = false }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const showStack = stacked && data.some((d) => d.af);
  const tip = h('div', { class: 'chart-tip', role: 'status' });
  const plot = h('div', { class: 'chart-plot' });
  const describe = (d) => {
    let t = `${d.tip || d.label}: ${fmt(d.value)}`;
    if (showStack && d.value) t += ` (davon alkoholfrei ${fmt(d.af || 0)})`;
    return t;
  };
  const showTip = (d, bar) => {
    tip.textContent = describe(d);
    tip.classList.add('show');
    const pr = plot.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const half = tip.offsetWidth / 2 || 60;
    const x = Math.min(Math.max(br.left - pr.left + br.width / 2, half), pr.width - half);
    tip.style.left = `${x}px`;
  };
  data.forEach((d, i) => {
    const pct = (d.value / max) * 100;
    const bar = h('div', { class: 'chart-bar', style: { height: d.value ? `max(${pct}%, 3px)` : '0' } });
    if (showStack && d.value) {
      const afPart = d.af || 0;
      const alcPart = d.value - afPart;
      if (alcPart) bar.append(h('div', { class: 'part alc', style: { flexGrow: String(alcPart) } }));
      if (afPart) bar.append(h('div', { class: 'part af', style: { flexGrow: String(afPart) } }));
    } else if (d.value) {
      bar.append(h('div', { class: `part ${series}`, style: { flexGrow: '1' } }));
    }
    plot.append(h('div', {
      class: 'chart-col', tabindex: '0', 'aria-label': describe(d),
      onpointerenter: (e) => showTip(d, e.currentTarget),
      onpointerdown: (e) => showTip(d, e.currentTarget),
      onfocus: (e) => showTip(d, e.currentTarget),
      onpointerleave: () => tip.classList.remove('show'),
      onblur: () => tip.classList.remove('show'),
    }, bar, h('span', { class: 'chart-x' }, i % labelEvery === 0 ? d.label : '')));
  });
  const table = h('details', { class: 'chart-table' }, h('summary', null, 'Tabelle'),
    h('table', null,
      showStack ? h('tr', null, h('th', null, ''), h('th', null, 'gesamt'), h('th', null, 'alkoholfrei')) : null,
      data.map((d) => h('tr', null, h('td', null, d.tip || d.label), h('td', null, fmt(d.value)),
        showStack ? h('td', null, fmt(d.af || 0)) : null))));
  return h('section', { class: 'card chart' },
    h('div', { class: 'chart-head' }, h('h3', null, title), h('span', { class: 'chart-max' }, `max ${fmt(max)}`)),
    showStack ? h('div', { class: 'legend' },
      h('span', null, h('i', { class: 'sw alc' }), 'alkoholisch'),
      h('span', null, h('i', { class: 'sw af' }), 'alkoholfrei')) : null,
    h('div', { class: 'chart-area' }, tip, plot),
    table);
}

/** Zweiteiliger Anteilsbalken (alkoholisch / alkoholfrei) mit Legende. */
export function shareBar({ title, a, b, labelA, labelB, fmt = String }) {
  const total = a + b;
  const pa = total ? (a / total) * 100 : 0;
  const pb = total ? 100 - pa : 0;
  const pctFmt = (p) => `${Math.round(p)} %`;
  return h('section', { class: 'card' },
    h('h3', null, title),
    total
      ? h('div', { class: 'share-bar', role: 'img', 'aria-label': `${labelA} ${pctFmt(pa)}, ${labelB} ${pctFmt(pb)}` },
        a ? h('div', { class: 'seg alc', style: { flexBasis: `${pa}%` }, title: `${labelA}: ${fmt(a)}` }) : null,
        b ? h('div', { class: 'seg af', style: { flexBasis: `${pb}%` }, title: `${labelB}: ${fmt(b)}` }) : null)
      : h('p', { class: 'muted' }, 'Noch keine Daten.'),
    total ? h('div', { class: 'legend' },
      h('span', null, h('i', { class: 'sw alc' }), `${labelA} ${fmt(a)} · ${pctFmt(pa)}`),
      h('span', null, h('i', { class: 'sw af' }), `${labelB} ${fmt(b)} · ${pctFmt(pb)}`)) : null);
}
