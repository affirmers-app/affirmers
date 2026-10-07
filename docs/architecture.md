# Affirmers architecture

Two parts: the on-chain programs on Solana, and the static site that reads public data about the network. This repository contains the site. The programs are described here so the site's assumptions are explicit.

## On-chain model (intent)

- **Coin.** One token per person, tied to a verified handle.
- **Vault.** An account derived from the coin, holding the portion of trading activity reserved for that person's backers.
- **Support record.** A public record that a backer sent support, confirmed against the public record before any reward is released.

## Site architecture

The site is a static bundle with no server. `tools/build.mjs` copies `src/` into `dist/`, generating from data:

- `assets/tokens.css` and `favicon.svg` from `src/tokens.json`, the only file allowed to contain colour values
- the contract band, social icons, info tiles and ticker from `src/register.json`
- the `_headers` file and the matching meta policy

### Register

Each external fact is one record: `chain`, `rpc`, `domain`, `ticker`, `ca`, `x`, `github`. A record is `stated`, `absent` or `unconfirmed`:

- `stated` renders live content. The contract band shows the address and enables copy; social icons become links whose handle is derived from the stored URL.
- `absent` and `unconfirmed` render inert placeholders with no `href` and no copy value.
- The contract address passes one test only: a base58 string of 32 to 44 characters.

### Live data

| Reading | Source | Cadence |
| --- | --- | --- |
| Slot, round trip | Solana RPC `getSlot` | about every 1.5 seconds |
| TVL | DefiLlama chains list, matched on the slug `solana` | every minute |
| Pairs | DexScreener search, filtered to Solana pairs | every 30 seconds |

The poller wraps each task. After a failure the next delay doubles up to a cap, with jitter so many clients do not retry in step. A success resets it. While the tab is hidden no timer exists; becoming visible triggers an immediate reading. Health is derived from the slot poller: connecting before the first success, live after it, offline after three consecutive failures.

### The 90-second call

`src/js/sim.js` is pure logic. A seeded generator shuffles twelve invented profiles, each with a hidden momentum score. The clock is passed in, so tests drive it directly. A YES on high momentum, or a NO on low momentum, counts as a good call. The result shows calls, backed, good calls, hit rate and best streak. It touches no wallet and no network.

### Security posture

The content security policy allows scripts and styles from the same origin only, forbids inline code, and allows network calls to exactly the RPC, DefiLlama and DexScreener origins. Images may come from the same origin and two DexScreener image hosts. Remote text is inserted with `textContent`, and remote image URLs are checked against an allow-list before use.

### Motion

Reveals use IntersectionObserver to toggle a class; transitions are CSS. Parallax and the progress bar use CSS scroll-driven animation, with a passive scroll listener only as a fallback. Every animation collapses under `prefers-reduced-motion`.

### Verification

`npm run gates` rebuilds into temporary folders, flips each gated record from its current state at runtime, and checks both branches. Network behaviour and the simulator are tested against synthetic fixtures with an injected clock, so the suite needs no network and finishes in seconds.
