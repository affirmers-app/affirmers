# Contributing to Affirmers

Thanks for helping. Affirmers ties social activity to coins built for Solana, and this repository holds its site, tooling and design documents. The rules below keep the project verifiable.

## Getting started

```
npm run build
npm run gates
npm run serve
```

Node 20 or newer is required. There are no runtime dependencies, so please do not add any without a strong reason written in the pull request.

## House rules

1. **One record per external fact.** Facts about the outside world, such as the contract address, social accounts and endpoints, live in `src/register.json` and nowhere else. Each has a state: `stated`, `absent` or `unconfirmed`.
2. **Store the URL, derive the handle.** Never hard-code a handle. Never emit an `href` for a record that is not `stated`.
3. **Do not blanket-reject addresses.** The address gate accepts any base58 string of 32 to 44 characters. Do not add suffix, prefix or pattern rules.
4. **Tokens only.** Colour values live in `src/tokens.json`, each traced to a sample in `brand/measured.json`. Do not put a colour literal in CSS, JavaScript or HTML.
5. **No dates on the page.** Internal records may carry them; rendered text may not.
6. **No new network origins** without updating the content security policy generator in `tools/build.mjs` and explaining why.

## Changing behaviour

Every gated element must have both branches proven in `tools/gates.mjs`. Gates read the current register record at runtime and flip it, so they stay correct whichever state the record is in. Do not anchor a gate to a specific value.

Keep the suite under five minutes and at thirty gates or fewer. If you need a new gate, fold an existing one.

## Pull requests

- Keep each change focused and describe the user-visible effect.
- Run `npm run build` and `npm run gates` before opening it. Both must exit zero.
- Write original copy. Interface text is checked against reference material for shared phrasing.

## Reporting problems

Security issues go through the process in `SECURITY.md`, never through public issues.
