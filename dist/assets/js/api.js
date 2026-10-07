// Live-data parsers and fetchers. Parsers are pure so gates can feed fixtures.
export const slugify = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function parseSlot(json) {
  const n = json && json.result;
  if (!Number.isInteger(n) || n < 0) throw new Error('bad slot');
  return n;
}

export function parseTvl(chains) {
  if (!Array.isArray(chains)) throw new Error('bad chains');
  const hit = chains.find((c) => slugify(c.name) === 'solana');
  if (!hit || !Number.isFinite(hit.tvl)) throw new Error('no solana tvl');
  return hit.tvl;
}

const LOGO_HOSTS = new Set(['cdn.dexscreener.com', 'dd.dexscreener.com']);

export function safeLogo(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LOGO_HOSTS.has(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

export function parsePairs(json) {
  if (!json || !Array.isArray(json.pairs)) throw new Error('bad pairs');
  const out = [];
  const seen = new Set();
  for (const p of json.pairs) {
    if (!p || p.chainId !== 'solana' || !p.baseToken || seen.has(p.pairAddress)) continue;
    const price = Number(p.priceUsd);
    if (!Number.isFinite(price)) continue;
    seen.add(p.pairAddress);
    const addr = p.baseToken.address;
    out.push({
      id: p.pairAddress,
      sym: String(p.baseToken.symbol || '?').slice(0, 12),
      quote: String((p.quoteToken && p.quoteToken.symbol) || '').slice(0, 12),
      price,
      vol: Number(p.volume && p.volume.h24) || 0,
      chg: Number(p.priceChange && p.priceChange.h24),
      liq: Number(p.liquidity && p.liquidity.usd) || 0,
      logo: safeLogo(p.info && p.info.imageUrl) ||
        (addr ? safeLogo(`https://dd.dexscreener.com/ds-data/tokens/solana/${addr}.png`) : null),
    });
  }
  if (!out.length) throw new Error('no solana pairs');
  return out;
}

async function getJson(fetchFn, url, init, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchFn(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const fetchSlot = (rpc, f = fetch) =>
  getJson(f, rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }),
  }).then(parseSlot);

export const fetchTvl = (f = fetch) => getJson(f, 'https://api.llama.fi/v2/chains').then(parseTvl);

export const fetchPairs = (f = fetch) =>
  getJson(f, 'https://api.dexscreener.com/latest/dex/search?q=solana').then(parsePairs);
