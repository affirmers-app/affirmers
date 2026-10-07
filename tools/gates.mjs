// Gates: node tools/gates.mjs. Synthetic fixtures only, fake clock, no network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build, loadRegister, validateRegister, ROOT, REQUIRED, csp } from './build.mjs';
import { isSolanaAddress } from '../src/js/gate.js';
import { nextDelay, createPoller } from '../src/js/poller.js';
import { parseSlot, parseTvl, parsePairs, safeLogo } from '../src/js/api.js';
import { fmtInt, fmtUsdCompact, fmtPrice, fmtChange, DASH } from '../src/js/format.js';
import { createSim, buildDeck, DURATION_MS, isGoodCall, mulberry32 } from '../src/js/sim.js';
import { srgbToOklch } from './oklch.mjs';
import { MARK_PATH } from './mark.mjs';

const gates = [];
const gate = (name, fn) => gates.push({ name, fn });
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'affirmers-gates-'));
let seq = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const rec = (reg, id) => reg.records.find((r) => r.id === id);

/* ---- synthetic fixtures ---- */
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const mkAddr = (n, tail = '') => { let s = ''; for (let i = 0; s.length < n - tail.length; i++) s += ALPHA[(i * 7 + 3) % ALPHA.length]; return s + tail; };
const FIX = {
  ca: mkAddr(44, 'pump'),
  x: 'https://x.com/fixture_handle',
  github: 'https://github.com/fixture-org/fixture-repo',
};
const asStated = (reg, id) => {
  const r = rec(reg, id);
  r.state = 'stated';
  if (id === 'ca') r.value = FIX.ca; else r.url = FIX[id];
  return reg;
};
const asAbsent = (reg, id) => {
  const r = rec(reg, id);
  r.state = 'absent';
  if (id === 'ca') r.value = null; else r.url = null;
  return reg;
};
function buildHtml(reg) {
  const out = path.join(tmpRoot, `b${seq++}`);
  build({ register: reg, outDir: out });
  return { out, html: fs.readFileSync(path.join(out, 'index.html'), 'utf8') };
}
// state-independent mutation: read the current record at runtime, flip it, return both orientations
function flipPair(id, base = loadRegister()) {
  const cur = clone(base);
  const mut = clone(base);
  (rec(mut, id).state === 'stated' ? asAbsent : asStated)(mut, id);
  const a = buildHtml(cur).html;
  const b = buildHtml(mut).html;
  const stated = rec(cur, id).state === 'stated' ? a : b;
  const absent = rec(cur, id).state === 'stated' ? b : a;
  return { stated, absent, curState: rec(cur, id).state, mutState: rec(mut, id).state };
}
const anchor = (html, id) => (html.match(new RegExp(`<[^>]*data-record="${id}"[^>]*>`, 'g')) || []);
const visibleText = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&mdash;/g, ' ').replace(/&hellip;/g, ' ').replace(/&middot;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const walk = (dir, skip = []) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (skip.includes(e.name)) return [];
  return e.isDirectory() ? walk(p, skip) : [p];
});

/* ---- 1-4 build + register ---- */
gate('build emits the deploy set', () => {
  const { out } = buildHtml(loadRegister());
  for (const f of ['index.html', 'favicon.svg', '_headers', 'robots.txt', 'assets/app.css', 'assets/tokens.css', 'assets/boot.js', 'assets/js/app.js', 'assets/js/poller.js', 'assets/js/api.js', 'assets/js/field.js'])
    assert.ok(fs.statSync(path.join(out, f)).size > 0, `missing ${f}`);
});
gate('dist/ matches a fresh build of the current register', () => {
  const { out } = buildHtml(loadRegister());
  for (const f of walk(out)) {
    const rel = path.relative(out, f);
    const d = path.join(ROOT, 'dist', rel);
    assert.ok(fs.existsSync(d), `dist missing ${rel}; run npm run build`);
    assert.equal(fs.readFileSync(d, 'utf8'), fs.readFileSync(f, 'utf8'), `dist stale: ${rel}`);
  }
});
gate('register: one record per fact, valid states, validator rejects bad input', () => {
  const reg = loadRegister();
  validateRegister(reg);
  assert.deepEqual(reg.records.map((r) => r.id).sort(), [...REQUIRED].sort());
  const dup = clone(reg); dup.records.push(clone(dup.records[0]));
  assert.throws(() => validateRegister(dup));
  const bad = clone(reg); rec(bad, 'x').state = 'maybe';
  assert.throws(() => validateRegister(bad));
  const empty = clone(reg); rec(empty, 'x').state = 'stated';
  assert.throws(() => validateRegister(empty));
});
gate('base58 gate accepts any 32-44 char base58, never blanket-rejects', () => {
  for (const ok of [mkAddr(32), mkAddr(44), mkAddr(44, 'pump'), '1'.repeat(32), 'So11111111111111111111111111111111111111112', mkAddr(40, 'bonk')])
    assert.ok(isSolanaAddress(ok), ok);
  for (const bad of [mkAddr(31), mkAddr(45), `0x${'a'.repeat(40)}`, `${mkAddr(31)}0`, `${mkAddr(31)}O`, `${mkAddr(31)}I`, `${mkAddr(31)}l`, ` ${mkAddr(32)}`, '', null, undefined, 7])
    assert.ok(!isSolanaAddress(bad), String(bad));
});

/* ---- 5-10 both branches of every gated record, mutation harness ---- */
gate('CA: absent branch is inert, stated branch is live (both proven)', () => {
  const { stated, absent } = flipPair('ca');
  assert.equal(anchor(absent, 'ca')[0].includes('data-state="absent"'), true);
  assert.ok(!/data-copy=/.test(absent), 'absent branch exposes copy value');
  assert.ok(/<button class="copy"[^>]*disabled/.test(absent));
  assert.ok(anchor(stated, 'ca')[0].includes('data-state="stated"'));
  assert.ok(stated.includes(`<code class="ca__addr" data-ca>${FIX.ca}</code>`) || /<code class="ca__addr" data-ca>[1-9A-HJ-NP-Za-km-z]{32,44}<\/code>/.test(stated), 'full address not rendered');
  assert.ok(/data-copy="[1-9A-HJ-NP-Za-km-z]{32,44}"/.test(stated));
  assert.ok(!/<button class="copy"[^>]*disabled/.test(stated));
});
for (const [id, host] of [['x', 'x.com'], ['github', 'github.com']]) {
  gate(`${id}: absent renders inert icon without href, stated renders derived link`, () => {
    const { stated, absent } = flipPair(id);
    const a = anchor(absent, id);
    assert.equal(a.length, 1);
    assert.ok(/aria-disabled="true"/.test(a[0]) && !/href=/.test(a[0]), 'absent icon must have no href');
    const s = anchor(stated, id);
    assert.equal(s.length, 1);
    assert.ok(new RegExp(`href="https://${host.replace('.', '\\.')}/`).test(s[0]));
    assert.ok(/rel="noopener noreferrer"/.test(s[0]));
  });
}
gate('mutation harness is state-independent (same results from inverted starting register)', () => {
  const inverted = loadRegister();
  for (const id of ['ca', 'x', 'github']) (rec(inverted, id).state === 'stated' ? asAbsent : asStated)(inverted, id);
  for (const id of ['ca', 'x', 'github']) {
    const { stated, absent, curState, mutState } = flipPair(id, inverted);
    assert.notEqual(curState, mutState);
    assert.ok(anchor(stated, id).length >= 1 && anchor(absent, id).length >= 1);
    assert.ok(anchor(stated, id).every((a) => a.includes('data-state="stated"')));
    assert.ok(anchor(absent, id).every((a) => !a.includes('data-state="stated"')));
  }
});
gate('link rule: unstated and unconfirmed records never produce an href', () => {
  const reg = loadRegister();
  for (const id of ['x', 'github']) { const r = rec(reg, id); r.state = 'unconfirmed'; r.url = FIX[id]; }
  const { html } = buildHtml(reg);
  for (const id of ['x', 'github']) assert.ok(!/href=/.test(anchor(html, id)[0]), `${id} unconfirmed leaked href`);
  assert.ok(!html.includes('fixture_handle') && !html.includes('fixture-org'));
  const ok = clone(loadRegister()); asStated(ok, 'x'); asStated(ok, 'github');
  const h = buildHtml(ok).html;
  assert.ok(/aria-label="X, fixture_handle"/.test(h));
  assert.ok(/aria-label="GitHub, fixture-org\/fixture-repo"/.test(h));
});

/* ---- 11-14 layout contracts ---- */
gate('socials: both icons top-right at every breakpoint, icon only, official marks', () => {
  const html = rd('dist/index.html');
  const css = rd('dist/assets/app.css');
  const end = html.match(/<div class="bar__end">([\s\S]*?)<\/div>\s*<\/div>\s*<\/header>/);
  assert.ok(end, 'bar__end not inside header');
  assert.equal((end[1].match(/class="soc"/g) || []).length, 2);
  for (const m of end[1].matchAll(/<(?:a|span) class="soc"[^>]*>([\s\S]*?)<\/(?:a|span)>/g)) assert.ok(/^<svg[\s\S]*<\/svg>$/.test(m[1].trim()), 'icon has text');
  assert.ok(end[1].includes('M18.244 2.25h3.308') && end[1].includes('M8 0c4.42 0 8 3.58 8 8'));
  assert.ok(!/\.soc[^{]*\{[^}]*display:\s*none/.test(css), 'a rule hides .soc');
  assert.ok(!/@media[^{]*\{[^@]*\.bar__end[^{]*\{[^}]*display:\s*none/.test(css));
});
gate('info tiles are exactly Chain, Contract, RPC; no X/GitHub tiles', () => {
  const html = rd('dist/index.html');
  const tiles = [...html.matchAll(/<article class="tile"[^>]*data-record="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['chain', 'ca', 'rpc']);
  const block = html.match(/<div class="tiles">([\s\S]*?)<\/div>\s*<section class="card pulse"/)[1];
  assert.ok(!/github|twitter|\bX\b/i.test(block.replace(/<[^>]+>/g, ' ')));
});
gate('CA slot sits at the top of main, before hero, large font', () => {
  const html = rd('dist/index.html');
  const iMain = html.indexOf('<main'), iCa = html.indexOf('data-record="ca"'), iHero = html.indexOf('class="hero');
  assert.ok(iMain < iCa && iCa < iHero);
  assert.ok(/\.ca__addr\{[^}]*font-size:clamp\([^)]*1\.9rem\)/.test(rd('dist/assets/app.css')));
});
gate('sections alternate dark and light panels', () => {
  const html = rd('dist/index.html');
  const seq = [...html.matchAll(/<(?:section|footer) class="([^"]*)"/g)].map((m) => m[1].split(/\s+/)).filter((c) => c.includes('dark') || c.includes('light')).map((c) => (c.includes('dark') ? 'd' : 'l'));
  assert.equal(seq.join(''), 'dldldld');
  assert.ok(html.includes('<canvas class="field"'));
});

/* ---- 15-19 palette, favicon, units, tap, motion ---- */
gate('palette: every token traces to a colour measured from the brand files, one tokens file', () => {
  const t = JSON.parse(rd('src/tokens.json'));
  const samples = JSON.parse(rd('brand/measured.json')).samples;
  assert.deepEqual(Object.keys(t.color).sort(), Object.keys(samples).sort());
  assert.ok(!/color-mix\(in oklch/.test(rd('src/css/app.css')), 'oklch mixing interpolates hue and invents colour; mix in oklab');
  for (const [k, v] of Object.entries(t.color)) {
    const m = v.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
    assert.ok(m, `${k}: ${v}`);
    const want = srgbToOklch(samples[k].rgb);
    assert.ok(Math.abs(+m[1] - want.L) < 0.003, `${k} lightness`);
    assert.ok(Math.abs(+m[2] - want.C) < 0.003, `${k} chroma`);
    if (want.C > 0.01) assert.ok(Math.abs(+m[3] - want.h) < 1.5, `${k} hue`);
    else assert.ok(+m[2] <= 0.01, `${k} neutral must stay near chroma 0`);
  }
  const lit = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/;
  for (const f of walk(path.join(ROOT, 'src'), []).filter((f) => !f.endsWith('tokens.json') && /\.(css|js|html|svg)$/.test(f))) assert.ok(!lit.test(fs.readFileSync(f, 'utf8')), `colour literal in ${path.relative(ROOT, f)}`);
  for (const f of walk(path.join(ROOT, 'dist')).filter((f) => !/tokens\.css$|favicon\.svg$/.test(f) && /\.(css|js|html)$/.test(f))) assert.ok(!lit.test(fs.readFileSync(f, 'utf8')), `literal in dist ${path.basename(f)}`);
  assert.ok(!/(?:^|[^-\w])(?:red|green|blue|yellow|orange|purple|pink|cyan|magenta)\b\s*[;,)}]/.test(rd('src/css/app.css')), 'named hue');
});
gate('favicon: 32x32 svg of the traced mark, token colours only, no double hyphen, no comments', () => {
  const svg = rd('dist/favicon.svg');
  const t = JSON.parse(rd('src/tokens.json')).color;
  assert.ok(/width="32"/.test(svg) && /height="32"/.test(svg) && /viewBox="0 0 32 32"/.test(svg));
  assert.ok(!svg.includes('--') && !svg.includes('<!--'));
  const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(fills, [t.brand, t.ink0]);
  assert.ok(svg.includes(MARK_PATH));
});
gate('90-second simulator: seeded, 90s window, scoring, timeout (fake clock)', () => {
  assert.equal(DURATION_MS, 90000);
  assert.deepEqual(buildDeck(7), buildDeck(7));
  assert.notDeepEqual(buildDeck(7).map((c) => c.id), buildDeck(8).map((c) => c.id));
  const r = mulberry32(3); const a = r(); assert.ok(a >= 0 && a < 1);
  const sim = createSim({ seed: 7, now: 0 });
  let s = sim.state(0);
  assert.equal(s.status, 'running'); assert.equal(s.remaining, 90000); assert.equal(s.calls, 0);
  const first = s.card;
  const res = sim.answer(true, 1000);
  assert.equal(res.good, isGoodCall(first, true));
  assert.equal(sim.state(1000).calls, 1);
  assert.equal(sim.tick(89999).status, 'running');
  assert.equal(sim.tick(90000).status, 'done');
  assert.equal(sim.state(90000).remaining, 0);
  assert.equal(sim.answer(false, 90001), null);
  assert.equal(sim.state(90001).calls, 1);
  assert.ok(sim.state(90001).timedOut);
  const full = createSim({ seed: 11, now: 0 });
  let t = 0; while (full.state(t).status === 'running') { full.answer(t % 2 === 0, t += 500); }
  const f = full.state(t);
  assert.equal(f.calls, f.total); assert.equal(f.timedOut, false);
  assert.equal(f.good, f.answers.filter((x) => x.good).length);
  assert.equal(f.hitRate, Math.round((f.good / f.calls) * 100));
  assert.ok(f.best >= (f.good ? 1 : 0) && f.best <= f.good);
  const late = createSim({ seed: 2, now: 0 });
  assert.equal(late.answer(true, 90000), null); assert.equal(late.state(90000).status, 'done');
});
gate('no ch units anywhere in css or html', () => {
  for (const f of ['src/css/app.css', 'src/index.html', 'src/tokens.json']) assert.ok(!/\d\s*ch\b/.test(rd(f)), f);
});
gate('tap targets: 44px token applied to every interactive control', () => {
  const t = JSON.parse(rd('src/tokens.json'));
  assert.equal(t.size.tap, '44px');
  const css = rd('src/css/app.css');
  for (const sel of ['.btn{', '.tab{', '.copy{', '.nav a{', '.brand{', '.soc{', '.search input{', '.ico{', '.chip{', '.domain{', '.btn--yes,.btn--no{']) {
    const i = css.indexOf(sel); assert.ok(i >= 0, sel);
    const block = css.slice(i, css.indexOf('}', i));
    assert.ok(/(?:min-)?(?:height|width):var\(--tap\)|min-height:(?:4[4-9]|[5-9]\d)px/.test(block), `${sel} lacks 44px`);
  }
  assert.ok(/\.dock a\{[^}]*min-height:56px/.test(css));
});
gate('reduced motion honoured in css and js; micro-interactions present', () => {
  const css = rd('src/css/app.css');
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*animation-duration:\.001ms!important/.test(css));
  assert.ok(/prefers-reduced-motion: reduce/.test(rd('src/js/app.js')));
  assert.ok((css.match(/:hover/g) || []).length >= 15 && css.includes(':focus-visible') && css.includes(':active'));
});

/* ---- 20-22 security, dates, copy ---- */
gate('CSP: meta + _headers cover every live origin, no inline code or styles', () => {
  const html = rd('dist/index.html');
  const headers = rd('dist/_headers');
  const policy = csp(loadRegister());
  assert.ok(html.includes(`content="${policy}"`) && headers.includes(policy));
  assert.ok(headers.includes("frame-ancestors 'none'"));
  const connect = policy.match(/connect-src ([^;]+)/)[1];
  const reg = loadRegister();
  const wanted = new Set([new URL(rec(reg, 'rpc').value).origin]);
  for (const f of walk(path.join(ROOT, 'src/js'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/https:\/\/(?:[\w-]+\.)+[a-z]+/g)) wanted.add(m[0]);
  for (const o of wanted) assert.ok(connect.includes(o) || policy.includes(o), `origin not in CSP: ${o}`);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(policy));
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html) && !/<style/.test(html) && !/\sstyle="/.test(html));
});
gate('no dates visible: page text, assets and docs stay date-free', () => {
  const dateRe = /\b(?:19|20)\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.? \d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i;
  assert.ok(!dateRe.test(visibleText(rd('dist/index.html'))), 'date in page text');
  for (const f of walk(path.join(ROOT, 'dist'))) assert.ok(!/\b20\d{2}-\d{2}-\d{2}\b/.test(fs.readFileSync(f, 'utf8')), `iso date in ${path.basename(f)}`);
  for (const f of ['README.md', 'docs/whitepaper.md', 'docs/tokenomics.md', 'docs/roadmap.md', 'docs/architecture.md']) assert.ok(!dateRe.test(rd(f)), `date in ${f}`);
  const reg = rd('dist/index.html'); assert.ok(!reg.includes('recorded') && !reg.includes('client statement'));
});
gate('copy: zero shared 2-grams with the reference (stopword-only pairs ignored)', () => {
  const stop = new Set('a an the of to in on for and or is it its you your we our by at as be are with that this from no not if so do up any per who when then than into only can will has have had one all each'.split(' '));
  const grams = (t) => { const w = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); const s = new Set(); for (let i = 0; i < w.length - 1; i++) if (!(stop.has(w[i]) && stop.has(w[i + 1]))) s.add(`${w[i]} ${w[i + 1]}`); return s; };
  const ref = grams(rd('reference/site-text.txt'));
  const own = grams(visibleText(rd('dist/index.html')));
  const shared = [...own].filter((g) => ref.has(g));
  assert.deepEqual(shared, [], `shared 2-grams: ${shared.join(' | ')}`);
  assert.ok(!/backers|trybackers|pump\.fun/i.test(rd('dist/index.html')));
});

/* ---- 23-24 repo + supporting files ---- */
gate('supporting files exist, are themed, and carry no AI attribution', () => {
  const need = ['README.md', 'docs/whitepaper.md', 'docs/tokenomics.md', 'docs/roadmap.md', 'docs/architecture.md', '.github/CONTRIBUTING.md', '.github/SECURITY.md', 'LICENSE'];
  for (const f of need) assert.ok(rd(f).length > 400, `${f} too thin`);
  for (const f of need.filter((f) => f.endsWith('.md'))) assert.ok(/affirmers/i.test(rd(f)) && /solana/i.test(rd(f)), `${f} not themed`);
  const bad = new RegExp(['claude', 'anthropic', 'generated (?:by|with)', 'ai[- ]generated', 'co-authored-by', 'chatgpt', 'copilot'].join('|'), 'i');
  for (const f of walk(ROOT, ['node_modules', '.git', 'reference']).filter((f) => !f.endsWith('gates.mjs') && /\.(md|json|mjs|js|html|css|svg|txt)$|LICENSE|_headers/.test(f))) assert.ok(!bad.test(fs.readFileSync(f, 'utf8')), `attribution in ${path.relative(ROOT, f)}`);
});
gate('repo hygiene: no CLAUDE.md, no .claude/, deploy output is dist/', () => {
  const all = walk(ROOT, ['node_modules']).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
  assert.ok(!all.some((f) => /(^|\/)claude\.md$/i.test(f)));
  assert.ok(!fs.existsSync(path.join(ROOT, '.claude')));
  assert.ok(fs.existsSync(path.join(ROOT, 'dist/index.html')));
  const html = rd('dist/index.html');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) assert.ok(fs.existsSync(path.join(ROOT, 'dist', m[1])), `dangling ${m[1]}`);
  assert.ok(!/<img/.test(html), 'no coin icon or logo image');
});

/* ---- 25-27 live-data logic on a fake clock ---- */
gate('backoff: exponential, jittered, capped, resets', () => {
  assert.equal(nextDelay(1500, 30000, 0), 1500);
  const lo = (n) => nextDelay(1500, 30000, n, () => 0);
  const hi = (n) => nextDelay(1500, 30000, n, () => 1);
  assert.equal(hi(1), 3000); assert.equal(hi(2), 6000); assert.equal(hi(3), 12000);
  assert.equal(lo(2), 3000);
  assert.equal(hi(10), 30000); assert.equal(lo(10), 15000);
  assert.ok(hi(3) > hi(2) && lo(3) > lo(2));
  assert.notEqual(nextDelay(1500, 30000, 4, () => 0.2), nextDelay(1500, 30000, 4, () => 0.9));
});
gate('poller lifecycle: backoff on failure, reset on success, pauses when hidden, resumes', async () => {
  const q = []; let now = 0; let hidden = false; const delays = [];
  const timers = { setTimeout: (f, ms) => { delays.push(ms); q.push({ f, at: now + ms }); return q.length; }, clearTimeout: (h) => { if (q[h - 1]) q[h - 1].dead = true; } };
  const run = async () => { const t = q.filter((x) => !x.dead && !x.done).sort((a, b) => a.at - b.at)[0]; if (!t) return false; t.done = true; now = t.at; await t.f(); return true; };
  let calls = 0; const plan = [false, false, false, true, true];
  const oks = []; const fails = [];
  const p = createPoller({ base: 100, max: 1000, rand: () => 1, timers, isHidden: () => hidden, task: async () => { const ok = plan[calls++]; if (!ok) throw new Error('x'); return calls; }, onOk: (v) => oks.push(v), onFail: (_e, n) => fails.push(n) });
  await p.start();
  assert.deepEqual(fails, [1]); assert.equal(delays.at(-1), 200);
  await run(); assert.equal(delays.at(-1), 400);
  await run(); assert.equal(delays.at(-1), 800);
  await run(); assert.equal(delays.at(-1), 100, 'success resets to base');
  hidden = true; p.visibility(); const before = calls;
  assert.ok(!(await run()) || calls === before, 'must not poll while hidden');
  assert.equal(p.pending, false);
  hidden = false; p.visibility(); await Promise.resolve(); await Promise.resolve();
  assert.ok(calls > before, 'resumes immediately when visible');
  p.stop(); assert.equal(p.pending, false);
});
gate('parsers on synthetic fixtures: slot, tvl by slug, pairs, logo hosts, dash fallback', () => {
  assert.equal(parseSlot({ result: 12345 }), 12345);
  assert.throws(() => parseSlot({ error: {} })); assert.throws(() => parseSlot({ result: 'x' }));
  const chains = [{ name: 'Solana Fixture', tvl: 1 }, { name: 'solana', tvl: 42 }, { name: 'Other', tvl: 9 }];
  assert.equal(parseTvl(chains), 42);
  assert.throws(() => parseTvl([{ name: 'Other', tvl: 1 }])); assert.throws(() => parseTvl({}));
  const mk = (o) => ({ chainId: 'solana', pairAddress: 'p1', baseToken: { symbol: 'AAA', address: 'tok' }, quoteToken: { symbol: 'USDC' }, priceUsd: '1.5', volume: { h24: 10 }, liquidity: { usd: 5 }, priceChange: { h24: 2 }, ...o });
  const pairs = parsePairs({ pairs: [mk({}), mk({}), mk({ pairAddress: 'p2', chainId: 'ethereum' }), mk({ pairAddress: 'p3', priceUsd: 'nope' }), mk({ pairAddress: 'p4', info: { imageUrl: 'https://cdn.dexscreener.com/a.png' } })] });
  assert.deepEqual(pairs.map((p) => p.id), ['p1', 'p4']);
  assert.equal(pairs[1].logo, 'https://cdn.dexscreener.com/a.png');
  assert.ok(pairs[0].logo.startsWith('https://dd.dexscreener.com/'));
  assert.throws(() => parsePairs({ pairs: [mk({ chainId: 'base' })] }));
  assert.equal(safeLogo('http://cdn.dexscreener.com/a.png'), null); assert.equal(safeLogo('https://evil.example/a.png'), null);
  assert.equal(fmtInt(NaN), DASH); assert.equal(fmtUsdCompact(undefined), DASH); assert.equal(fmtPrice(NaN), DASH); assert.equal(fmtChange(NaN), DASH);
  assert.equal(fmtUsdCompact(6.53e9), '$6.53B'); assert.equal(fmtInt(1234567), '1,234,567');
});

/* ---- 28-30 wiring ---- */
gate('live features wired: slot RPC, health states, TVL slug, pairs, skeletons, visibility pause', () => {
  const app = rd('src/js/app.js'), api = rd('src/js/api.js'), css = rd('src/css/app.css'), html = rd('dist/index.html');
  assert.ok(api.includes("method: 'getSlot'") && api.includes('api.llama.fi/v2/chains') && api.includes("slugify(c.name) === 'solana'") && api.includes('api.dexscreener.com'));
  assert.ok(app.includes("visibilitychange") && app.includes('createPoller') && app.includes('setHealth'));
  for (const s of ['live', 'connecting', 'offline']) assert.ok(css.includes(`.pill[data-state="${s}"]`) && app.includes(`${s}:`));
  assert.ok(css.includes('@keyframes pulse') && css.includes('@keyframes shimmer') && css.includes('@keyframes flash'));
  assert.ok((html.match(/data-skel/g) || []).length >= 4 && app.includes('skeletons()'));
  assert.ok(app.includes('DASH'));
  assert.ok(html.includes('data-slot') && html.includes('data-tvl') && html.includes('id="pairs"'));
});
gate('scroll: IntersectionObserver reveals, CSS timelines, passive listener only as fallback', () => {
  const app = rd('src/js/app.js'), css = rd('src/css/app.css');
  assert.ok(app.includes('IntersectionObserver'));
  assert.ok(css.includes('animation-timeline:scroll(root)'));
  assert.equal((app.match(/addEventListener\('scroll'/g) || []).length, 1);
  assert.ok(/addEventListener\('scroll'[\s\S]{0,260}\{ passive: true \}/.test(app));
  assert.ok(!/getBoundingClientRect|scrollTop|offsetTop|parallax/.test(app.slice(app.indexOf("addEventListener('scroll'") - 200, app.indexOf("addEventListener('scroll'") + 300)));
});
gate('transition and motion values match the measured reference', () => {
  const t = JSON.parse(rd('src/tokens.json'));
  assert.equal(t.motion.ease, 'cubic-bezier(0.4, 0, 0.2, 1)');
  assert.equal(t.motion.fast, '150ms'); assert.equal(t.motion.pulse, '1600ms');
  assert.equal(t.motion.spring, 'cubic-bezier(0.2, 1.4, 0.4, 1)');
  assert.equal(t.size.container, '1200px'); assert.equal(t.size.radius, '16px'); assert.equal(t.size.gap, '12px');
  assert.ok(rd('src/js/app.js').includes('base: 1500'));
});

/* ---- runner ---- */
assert.ok(gates.length <= 30, `too many gates: ${gates.length}`);
let failed = 0;
const t0 = Date.now();
for (const [i, g] of gates.entries()) {
  const s = Date.now();
  try { await g.fn(); console.log(`PASS ${String(i + 1).padStart(2)}  ${g.name}  (${Date.now() - s}ms)`); }
  catch (e) { failed++; console.log(`FAIL ${String(i + 1).padStart(2)}  ${g.name}\n      ${String(e.message).split('\n').join('\n      ')}`); }
}
fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${gates.length - failed}/${gates.length} gates passed in ${Date.now() - t0}ms`);
process.exit(failed ? 1 : 0);
