// Static build: src/ -> dist/. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isSolanaAddress } from '../src/js/gate.js';
import { deriveX, deriveGithub } from '../src/js/links.js';
import { MARK_PATH, MARK_VIEWBOX } from './mark.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATES = ['stated', 'absent', 'unconfirmed'];
export const REQUIRED = ['chain', 'rpc', 'domain', 'ticker', 'ca', 'x', 'github'];
export const LIVE_ORIGINS = ['https://api.llama.fi', 'https://api.dexscreener.com'];
export const IMG_ORIGINS = ['https://cdn.dexscreener.com', 'https://dd.dexscreener.com'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (p) => fs.readFileSync(p, 'utf8');

export function loadRegister(file = path.join(ROOT, 'src/register.json')) {
  return JSON.parse(read(file));
}

export function validateRegister(reg) {
  const seen = new Set();
  for (const r of reg.records) {
    if (seen.has(r.id)) throw new Error(`duplicate record: ${r.id}`);
    seen.add(r.id);
    if (!STATES.includes(r.state)) throw new Error(`bad state on ${r.id}`);
    const payload = r.id === 'x' || r.id === 'github' ? r.url : r.value;
    if (r.state === 'stated' && !payload) throw new Error(`stated record without payload: ${r.id}`);
    if (r.id === 'ca' && r.state === 'stated' && !isSolanaAddress(r.value)) throw new Error('ca is not a 32-44 char base58 string');
    if (r.id === 'x' && r.state === 'stated' && !deriveX(r.url)) throw new Error('x url not derivable');
    if (r.id === 'github' && r.state === 'stated' && !deriveGithub(r.url)) throw new Error('github url not derivable');
  }
  for (const id of REQUIRED) if (!seen.has(id)) throw new Error(`missing record: ${id}`);
}

const rec = (reg, id) => reg.records.find((r) => r.id === id);

const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

function socialIcon(r, label, svg, derive) {
  const d = r.state === 'stated' ? derive(r.url) : null;
  if (d) {
    return `<a class="soc" data-record="${r.id}" data-state="stated" href="${esc(d.href)}" target="_blank" rel="noopener noreferrer" aria-label="${label}, ${esc(d.handle)}">${svg}</a>`;
  }
  return `<span class="soc" data-record="${r.id}" data-state="${esc(r.state)}" role="img" aria-disabled="true" aria-label="${label}, not linked yet">${svg}</span>`;
}

export function renderSocial(reg) {
  return socialIcon(rec(reg, 'x'), 'X', X_SVG, deriveX) + socialIcon(rec(reg, 'github'), 'GitHub', GH_SVG, deriveGithub);
}

export function renderCa(reg) {
  const r = rec(reg, 'ca');
  const label = '<div class="ca__label"><i class="dot dot--sm" aria-hidden="true"></i>Contract address</div>';
  if (r.state === 'stated') {
    const a = esc(r.value);
    return `<section class="ca" data-record="ca" data-state="stated" aria-label="Contract address"><div class="wrap ca__in">${label}<div class="ca__row"><code class="ca__addr" data-ca>${a}</code><button class="copy" type="button" data-copy="${a}">${COPY_SVG}<span data-copy-label aria-live="polite">Copy</span></button></div></div></section>`;
  }
  const msg = r.state === 'unconfirmed' ? 'Awaiting confirmation from the team.' : 'Not published yet. It lands here the moment the team states it.';
  return `<section class="ca" data-record="ca" data-state="${esc(r.state)}" aria-label="Contract address"><div class="wrap ca__in">${label}<div class="ca__row"><p class="ca__addr" data-ca>${msg}</p><button class="copy" type="button" disabled aria-disabled="true">${COPY_SVG}<span data-copy-label>Copy</span></button></div></div></section>`;
}

export function renderTiles(reg) {
  const chain = rec(reg, 'chain');
  const ca = rec(reg, 'ca');
  const rpc = rec(reg, 'rpc');
  const tile = (id, state, k, v, s, mono) =>
    `<article class="tile" data-reveal data-record="${id}" data-state="${state}"><span class="tile__k">${k}</span><span class="tile__v${mono ? ' mono' : ''}">${v}</span><span class="tile__s">${s}</span></article>`;
  const caShort = ca.state === 'stated' ? `${esc(ca.value.slice(0, 6))}&hellip;${esc(ca.value.slice(-6))}` : 'Not yet stated';
  const host = rpc.state === 'stated' ? new URL(rpc.value).host : 'Not yet stated';
  return [
    tile('chain', chain.state, 'Chain', esc(chain.state === 'stated' ? chain.value : 'Not yet stated'), 'Production network', false),
    tile('ca', ca.state, 'Contract', caShort, ca.state === 'stated' ? 'Full address sits at the top' : 'The slot stays open', true),
    tile('rpc', rpc.state, 'RPC', esc(host), 'Public read endpoint', true),
  ].join('');
}

export function csp(reg) {
  const rpc = rec(reg, 'rpc');
  const rpcOrigin = rpc.state === 'stated' ? new URL(rpc.value).origin : null;
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: ${IMG_ORIGINS.join(' ')}`,
    `connect-src 'self' ${[rpcOrigin, ...LIVE_ORIGINS].filter(Boolean).join(' ')}`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function tokensCss(tokens) {
  const lines = [];
  for (const [k, v] of Object.entries(tokens.color)) lines.push(`--${k}:${v}`);
  for (const [k, v] of Object.entries(tokens.motion)) lines.push(`--${k}:${v}`);
  for (const [k, v] of Object.entries(tokens.size)) lines.push(`--${k}:${v}`);
  for (const [k, v] of Object.entries(tokens.font)) lines.push(`--${k}:${v}`);
  return `:root{color-scheme:dark;${lines.join(';')}}\n`;
}

export function faviconSvg(tokens) {
  const c = tokens.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${c.brand}"/><svg x="5" y="8" width="22" height="17" viewBox="${MARK_VIEWBOX}"><path d="${MARK_PATH}" fill="${c.ink0}"/></svg></svg>\n`;
}

function copyDir(from, to, filter = () => true) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (!filter(f)) continue;
    fs.copyFileSync(path.join(from, f), path.join(to, f));
  }
}

export function build({ register = loadRegister(), outDir = path.join(ROOT, 'dist') } = {}) {
  validateRegister(register);
  const tokens = JSON.parse(read(path.join(ROOT, 'src/tokens.json')));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'assets/js'), { recursive: true });

  const rpc = rec(register, 'rpc');
  const domain = rec(register, 'domain');
  const ticker = rec(register, 'ticker');
  const policy = csp(register);
  const html = read(path.join(ROOT, 'src/index.html'))
    .replace('{{csp}}', () => policy.replace(/"/g, '&quot;'))
    .replace('{{markdef}}', () => `<svg width="0" height="0" aria-hidden="true" focusable="false" class="sr"><symbol id="mark" viewBox="${MARK_VIEWBOX}"><path d="${MARK_PATH}"/></symbol></svg>`)
    .replace('{{rpc}}', () => esc(rpc.state === 'stated' ? rpc.value : ''))
    .replace('{{social}}', () => renderSocial(register))
    .replace('{{ca}}', () => renderCa(register))
    .replace('{{tiles}}', () => renderTiles(register))
    .replace('{{ticker}}', () => esc(ticker.state === 'stated' ? ticker.value : ''))
    .replaceAll('{{domain}}', () => esc(domain.state === 'stated' ? domain.value : 'Affirmers'));
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  fs.writeFileSync(path.join(outDir, 'favicon.svg'), faviconSvg(tokens));
  fs.writeFileSync(path.join(outDir, 'assets/tokens.css'), tokensCss(tokens));
  fs.copyFileSync(path.join(ROOT, 'src/css/app.css'), path.join(outDir, 'assets/app.css'));
  fs.copyFileSync(path.join(ROOT, 'src/js/boot.js'), path.join(outDir, 'assets/boot.js'));
  copyDir(path.join(ROOT, 'src/js'), path.join(outDir, 'assets/js'), (f) => f.endsWith('.js') && f !== 'boot.js');
  fs.writeFileSync(path.join(outDir, '_headers'),
    `/*\n  Content-Security-Policy: ${policy}; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/assets/*\n  Cache-Control: public, max-age=3600\n`);
  fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  return { outDir };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { outDir } = build();
  console.log(`built -> ${path.relative(ROOT, outDir)}/`);
}
