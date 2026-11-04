export { formatMoney } from '../lib/money';
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dollarsToCents = (v: string) => Math.round(Number(v) * 100);
