import { fetchSlot, fetchTvl, fetchPairs } from './api.js';
import { createPoller } from './poller.js';
import { DASH, fmtInt, fmtUsdCompact, fmtPrice, fmtChange } from './format.js';
import { startField } from './field.js';
import { createSim, DURATION_MS } from './sim.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rpc = document.body.dataset.rpc;

/* ---------- number display: count-up on first value, flash on change ---------- */
const COUNT_MS = 900;
function setNumber(el, value, fmt) {
  const prev = el._v;
  el.classList.remove('is-skel');
  if (!Number.isFinite(value)) {
    el._v = undefined;
    el.textContent = DASH;
    return;
  }
  el._v = value;
  if (prev === value && el.textContent !== DASH) return;
  if (reduced || document.hidden) { el.textContent = fmt(value); return; }
  const from = Number.isFinite(prev) ? prev : 0;
  const dur = Number.isFinite(prev) ? 320 : COUNT_MS;
  const t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const frame = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (value - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(frame);
    else el.textContent = fmt(value);
  };
  el._raf = requestAnimationFrame(frame);
  if (Number.isFinite(prev)) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
}
const setAll = (sel, value, fmt) => $$(sel).forEach((el) => setNumber(el, value, fmt));
$$('[data-skel]').forEach((el) => el.classList.add('is-skel'));

/* ---------- chain health ---------- */
const LABEL = { live: 'Live', connecting: 'Connecting', offline: 'Offline' };
function setHealth(state) {
  $$('[data-health]').forEach((p) => {
    p.dataset.state = state;
    $('[data-health-text]', p).textContent = LABEL[state];
  });
}

/* ---------- slot ticker ---------- */
let lastRtt = null;
const slotPoller = createPoller({
  base: 1500,
  max: 30000,
  task: async () => {
    const t = performance.now();
    const slot = await fetchSlot(rpc);
    lastRtt = Math.round(performance.now() - t);
    return slot;
  },
  onOk: (slot) => {
    setHealth('live');
    setAll('[data-slot]', slot, fmtInt);
    $('[data-rtt]').textContent = `${lastRtt} ms`;
  },
  onFail: (_e, n) => {
    if (n >= 3) {
      setHealth('offline');
      setAll('[data-slot]', NaN, fmtInt);
      $('[data-rtt]').textContent = DASH;
    }
  },
});

/* ---------- TVL ---------- */
const tvlPoller = createPoller({
  base: 60000,
  max: 300000,
  task: fetchTvl,
  onOk: (v) => setAll('[data-tvl]', v, fmtUsdCompact),
  onFail: () => setAll('[data-tvl]', NaN, fmtUsdCompact),
});

/* ---------- pair board ---------- */
const board = { pairs: null, sort: 'vol', filter: '', shown: 6, failed: false };
const grid = $('#pairs');
const moreBtn = $('[data-more]');
const countEl = $('[data-board-count]');

const sorters = {
  vol: (a, b) => b.vol - a.vol,
  price: (a, b) => b.price - a.price,
  liq: (a, b) => b.liq - a.liq,
  chg: (a, b) => Math.abs(b.chg || 0) - Math.abs(a.chg || 0),
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function skeletons() {
  grid.replaceChildren(...Array.from({ length: 6 }, () => {
    const c = el('article', 'card pair is-skel');
    c.append(el('span', 'logo'));
    const id = el('div', 'pair__id'); id.append(el('i'), el('i', 'w'));
    const px = el('div'); px.append(el('i'), el('i', 'w'));
    c.append(id, px);
    return c;
  }));
  grid.setAttribute('aria-busy', 'true');
}

function logoNode(p) {
  const wrap = el('span', 'logo');
  const mono = () => { wrap.replaceChildren(document.createTextNode(p.sym.slice(0, 1).toUpperCase())); };
  if (p.logo) {
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', mono, { once: true });
    img.src = p.logo;
    wrap.append(img);
  } else mono();
  return wrap;
}

function pairCard(p) {
  const c = el('article', 'card pair');
  const id = el('div', 'pair__id');
  id.append(el('div', 'pair__sym', p.sym), el('div', 'pair__q', p.quote ? `/ ${p.quote}` : ''));
  const px = el('div');
  const chg = el('span', `pair__chg${p.chg > 0 ? ' up' : ''}`, fmtChange(p.chg));
  px.append(el('div', 'pair__px', fmtPrice(p.price)), chg);
  const meta = el('div', 'pair__meta');
  const v = el('span', '', '24h vol '); v.append(el('b', '', fmtUsdCompact(p.vol)));
  const d = el('span', '', 'depth '); d.append(el('b', '', fmtUsdCompact(p.liq)));
  meta.append(v, d);
  c.append(logoNode(p), id, px, meta);
  return c;
}

function renderBoard() {
  if (!board.pairs) {
    if (board.failed) {
      grid.replaceChildren(el('p', 'empty', 'Pair feed unreachable. Retrying quietly.'));
      grid.setAttribute('aria-busy', 'false');
      countEl.textContent = DASH;
      moreBtn.hidden = true;
    }
    return;
  }
  const q = board.filter.trim().toLowerCase();
  const list = board.pairs.filter((p) => !q || p.sym.toLowerCase().includes(q)).sort(sorters[board.sort]);
  grid.setAttribute('aria-busy', 'false');
  countEl.textContent = `${list.length} ${list.length === 1 ? 'pair' : 'pairs'}`;
  if (!list.length) {
    grid.replaceChildren(el('p', 'empty', 'No pair matches that symbol.'));
    moreBtn.hidden = true;
    return;
  }
  grid.replaceChildren(...list.slice(0, board.shown).map(pairCard));
  moreBtn.hidden = list.length <= board.shown;
}

const pairsPoller = createPoller({
  base: 30000,
  max: 300000,
  task: fetchPairs,
  onOk: (pairs) => {
    board.pairs = pairs;
    board.failed = false;
    setAll('[data-vol]', pairs.reduce((s, p) => s + p.vol, 0), fmtUsdCompact);
    setAll('[data-count]', pairs.length, fmtInt);
    $('.stats__grid').setAttribute('aria-busy', 'false');
    renderBoard();
  },
  onFail: () => {
    board.pairs = null;
    board.failed = true;
    setAll('[data-vol]', NaN, fmtUsdCompact);
    setAll('[data-count]', NaN, fmtInt);
    renderBoard();
  },
});

const tabs = $$('.tab');
function selectTab(tab, focus) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  board.sort = tab.dataset.sort;
  grid.setAttribute('aria-labelledby', tab.id);
  if (focus) tab.focus();
  renderBoard();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (k === undefined) return;
    e.preventDefault();
    selectTab(tabs[(k + tabs.length) % tabs.length], true);
  });
});
$('[data-filter]').addEventListener('input', (e) => { board.filter = e.target.value; board.shown = 6; renderBoard(); });
moreBtn.addEventListener('click', () => { board.shown += 6; renderBoard(); });

/* ---------- copy contract address ---------- */
const copyBtn = $('[data-copy]');
if (copyBtn && !copyBtn.disabled) {
  const label = $('[data-copy-label]', copyBtn);
  let timer = 0;
  copyBtn.addEventListener('click', async () => {
    const text = copyBtn.dataset.copy;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    copyBtn.dataset.copied = String(ok);
    clearTimeout(timer);
    timer = setTimeout(() => { label.textContent = 'Copy'; copyBtn.dataset.copied = 'false'; }, 1800);
  });
}

/* ---------- reveal on view ---------- */
const reveals = $$('[data-reveal]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  reveals.forEach((r) => io.observe(r));
} else reveals.forEach((r) => r.classList.add('in'));

/* ---------- progress bar: CSS scroll timeline, listener only as fallback ---------- */
if (!CSS.supports('animation-timeline', 'scroll()')) {
  const root = document.documentElement;
  addEventListener('scroll', () => {
    root.style.setProperty('--p', String(scrollY / Math.max(1, root.scrollHeight - innerHeight)));
  }, { passive: true });
}

/* ---------- 90-second YES/NO call ---------- */
const simEl = $('[data-sim]');
if (simEl) {
  const panel = (n) => $(`[data-panel="${n}"]`, simEl);
  const panels = { idle: panel('idle'), run: panel('run'), done: panel('done') };
  const clock = $('[data-sim-clock]', simEl);
  const bar = $('[data-sim-bar]', simEl);
  const cardEl = $('[data-sim-card]', simEl);
  const verdict = $('[data-sim-verdict]', simEl);
  let sim = null, timer = 0, locked = false;

  const show = (name) => {
    Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== name; });
    simEl.dataset.phase = name;
  };
  const paint = (s) => {
    clock.textContent = String(Math.ceil(s.remaining / 1000));
    bar.style.setProperty('--t', String(s.remaining / DURATION_MS));
    simEl.dataset.low = String(s.remaining < 10000);
  };
  const renderCard = (s) => {
    if (!s.card) return;
    $('[data-sim-name]', simEl).textContent = s.card.name;
    $('[data-sim-line]', simEl).textContent = s.card.line;
    $('[data-sim-count]', simEl).textContent = `Profile ${s.index + 1} of ${s.total}`;
    cardEl.style.animation = 'none';
    void cardEl.offsetWidth;
    cardEl.style.animation = '';
  };
  const finish = (s) => {
    clearInterval(timer);
    show('done');
    $('[data-sim-title]', simEl).textContent = s.timedOut ? 'Time is up' : 'Deck cleared';
    $('[data-sim-calls]', simEl).textContent = fmtInt(s.calls);
    $('[data-sim-backed]', simEl).textContent = fmtInt(s.backed);
    $('[data-sim-good]', simEl).textContent = fmtInt(s.good);
    $('[data-sim-rate]', simEl).textContent = s.hitRate === null ? DASH : `${s.hitRate}%`;
    $('[data-sim-best]', simEl).textContent = fmtInt(s.best);
    clock.textContent = String(Math.ceil(s.remaining / 1000));
  };
  const start = () => {
    sim = new_sim();
    locked = false;
    verdict.textContent = ' ';
    show('run');
    const s = sim.state(performance.now());
    paint(s);
    renderCard(s);
    clearInterval(timer);
    timer = setInterval(() => {
      const t = sim.tick(performance.now());
      if (t.status === 'done') finish(t); else paint(t);
    }, 100);
  };
  const new_sim = () => createSim({ seed: (Date.now() & 0xffff) + 1, now: performance.now() });
  const answer = (yes) => {
    if (!sim || locked || simEl.dataset.phase !== 'run') return;
    const r = sim.answer(yes, performance.now());
    const s = sim.state(performance.now());
    if (!r || s.status === 'done') { if (r) verdict.textContent = r.good ? 'Good call' : 'Missed it'; finish(s); return; }
    verdict.textContent = r.good ? 'Good call' : 'Missed it';
    locked = true;
    setTimeout(() => { locked = false; verdict.textContent = ' '; if (simEl.dataset.phase === 'run') renderCard(s); }, 420);
  };
  $('[data-sim-start]', simEl).addEventListener('click', start);
  $('[data-sim-again]', simEl).addEventListener('click', start);
  $('[data-sim-yes]', simEl).addEventListener('click', () => answer(true));
  $('[data-sim-no]', simEl).addEventListener('click', () => answer(false));
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'y' || e.key === 'Y') answer(true);
    if (e.key === 'n' || e.key === 'N') answer(false);
  });
}

/* ---------- boot ---------- */
const canvas = $('#field');
if (canvas) startField(canvas, { reduced });
skeletons();
const pollers = [slotPoller, tvlPoller, pairsPoller];
pollers.forEach((p) => p.start());
document.addEventListener('visibilitychange', () => pollers.forEach((p) => p.visibility()));
