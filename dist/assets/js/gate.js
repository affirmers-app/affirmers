// Solana address gate: any 32-44 character base58 string passes. No other rule.
export const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(value) {
  return typeof value === 'string' && BASE58.test(value);
}
