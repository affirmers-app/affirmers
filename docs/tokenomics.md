# Affirmers tokenomics

The Affirmers ticker is AFRM. The team has stated no supply, allocation, fee split or price for Affirmers on Solana, and this document publishes none. It records the principles any future parameters must satisfy, and lists what is still open.

## Principles

1. **Utility before speculation.** Tokens exist to carry a person's name, to feed their vault, and to let backers share in what follows. The interface never implies a return.
2. **The vault is the engine.** Activity around a coin routes a portion into a vault for the person it names. Reward flows come out of that vault and nowhere else. Nothing extra is minted to pay for engagement.
3. **Visible by construction.** Every movement in and out of a vault is derivable from public accounts. There are no hidden treasuries.
4. **Rewards track participation.** Weight goes to unique supporters and to time held, not to raw volume, so wash trading earns little.
5. **Small must matter.** A small backer should not be priced out of taking part.

## Flows

```
trade      -> a portion routes into the vault for the person named by the coin
support    -> money reaches the person directly, confirmed against the public record
reward     -> released from the vault to confirmed backers, weighted by participation
```

## Open parameters

These are intentionally unset:

- the share of each trade routed to a vault
- the share routed to protocol upkeep
- the weighting formula for backer rewards, and its per-wallet cap
- how long a vault holds an unclaimed reward before it returns to the vault pool
- the verification path that ties a coin to a handle
- any team or contributor allocation and its vesting

Each will be proposed in public, with reasoning, before it is fixed.

## What this document is not

It is not an offer, a forecast, or advice. Figures on the website are live readings from public feeds and say nothing about Affirmers itself.
