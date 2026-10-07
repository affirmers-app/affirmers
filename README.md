# Affirmers

Affirmers ties social activity to coins built for Solana. Back the people you believe in, and share in the activity their coin creates. Support can travel both ways.

This repository holds the public site (`affirmers.app`), the design documents, and the build and verification tooling.

## Status

| Fact | State |
| --- | --- |
| Chain | Solana, production network |
| Public RPC | `https://solana-rpc.publicnode.com` |
| Ticker | AFRM, from the brand comps |
| Contract address | not yet stated |
| X account | not yet stated |
| Source repository link | not yet stated |

Anything marked "not yet stated" renders on the site as an inert placeholder. Nothing is linked, copied or guessed until the team states it.

## What the site does

- A hero that follows the brand comps: green display headline, a post card, and floating mark medallions
- Live readings: current slot with a chain health pill, Solana TVL from DefiLlama, and a board of Solana-tagged pairs from DexScreener
- A 90-second YES/NO call: a simulation with invented profiles and a toy score, no wallet and no money
- A contract address slot at the top of the page, inert until the address is stated
- X and GitHub icons at the top right at every width, inert until their URLs are stated

## Layout

```
src/            site source: html, css, js, tokens, register
tools/          build, local server, gates
dist/           deploy output, drag this folder to the host
docs/           whitepaper, tokenomics, roadmap, architecture
.github/        contributing and security policy
brand/          logo files and the measured colour samples
reference/      design comps and notes used while building
```

## Commands

```
npm run build    # src -> dist
npm run gates    # verify both branches of every gated fact
npm run serve    # static preview of dist on port 4173
```

Node 20 or newer. There are no runtime dependencies.

## The register

Every external fact lives in `src/register.json` as one record with a state of `stated`, `absent` or `unconfirmed`. To publish the contract address, set the `ca` record to `stated` with a base58 string of 32 to 44 characters and rebuild: the slot at the top switches from inert to live and copy starts working. The `x` and `github` records store a URL and the handle is derived from it.

## Palette

Colours live only in `src/tokens.json`. Each value is converted from a pixel sampled out of the supplied brand files; `brand/measured.json` records the samples and a gate fails the build if a token drifts from its sample or a colour literal appears anywhere else.

## Live readings

The page talks to three public sources and nothing else: the Solana RPC for the current slot, DefiLlama for chain TVL, and DexScreener for Solana-tagged pairs. Every poller backs off exponentially with jitter after a failure, shows a dash while its source is down, and stops while the tab is hidden. The content security policy in `dist/_headers` and the page meta tag lists exactly these origins.

## Deploying

Upload the contents of `dist/` to the static host. The `_headers` file is read by hosts that support it.

## License

MIT, see `LICENSE`.
