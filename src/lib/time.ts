/**
 * Date/time helpers. Appointment times are "naive" local strings
 * (`YYYY-MM-DDTHH:mm`) interpreted in the hospital's own timezone, so
 * behaviour never depends on the machine timezone.
 */
export const parseLocal = (s: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid datetime "${s}" (expected YYYY-MM-DDTHH:mm)`);
  const [, y, mo, d, h, mi] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) / 60000; // minutes since epoch
};
export const isLocalDateTime = (s: string): boolean => {
  try {
    parseLocal(s);
    return true;
  } catch {
    return false;
  }
};
export const dayOfWeek = (s: string): number => new Date(parseLocal(s) * 60000).getUTCDay();
export const datePart = (s: string): string => s.slice(0, 10);
export const minutesOfDay = (hhmm: string): number => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time "${hhmm}" (expected HH:mm)`);
  return Number(m[1]) * 60 + Number(m[2]);
};
export const timeOfDay = (s: string): number => minutesOfDay(s.slice(11, 16));
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;
/** Format a Date as naive hospital-local `YYYY-MM-DDTHH:mm` (UTC fields used as the hospital clock). */
export const toLocalString = (d: Date): string => d.toISOString().slice(0, 16);
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
