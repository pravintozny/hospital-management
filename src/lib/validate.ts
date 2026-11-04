import { ValidationError } from './errors';

export const required = (v: string | undefined | null, field: string): string => {
  const t = (v ?? '').trim();
  if (!t) throw new ValidationError(`${field} is required`);
  return t;
};
export const phone = (v: string, field: string): string => {
  const t = required(v, field);
  if (!/^\+?[0-9][0-9\s-]{6,18}$/.test(t)) throw new ValidationError(`${field} is not a valid phone number`);
  return t;
};
export const email = (v: string | undefined, field: string): string | undefined => {
  if (!v?.trim()) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) throw new ValidationError(`${field} is not a valid email`);
  return v.trim();
};
export const positiveInt = (n: number, field: string): number => {
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${field} must be a positive integer`);
  return n;
};
export const nonNegativeInt = (n: number, field: string): number => {
  if (!Number.isInteger(n) || n < 0) throw new ValidationError(`${field} must be a non-negative integer`);
  return n;
};
