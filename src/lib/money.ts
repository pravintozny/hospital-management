/** All money is integer minor units (cents) to avoid floating-point drift. */
export const isCents = (n: number): boolean => Number.isInteger(n) && n >= 0;
export const formatMoney = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
/** Round-half-up of cents * basisPoints / 10000. */
export const applyBps = (cents: number, bps: number): number => Math.round((cents * bps) / 10000);
