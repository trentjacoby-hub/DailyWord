import { format, parse, addDays, subDays, isAfter } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const CST_TIMEZONE = 'America/Chicago';

export function getTodayCST(): Date {
  return toZonedTime(new Date(), CST_TIMEZONE);
}

/** Format a Date as YYYY-MM-DD */
export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Parse an ISO date string YYYY-MM-DD into a Date */
export function parseISODate(dateStr: string): Date {
  return parse(dateStr, 'yyyy-MM-dd', new Date());
}

/** Human-readable date: "Saturday, June 27, 2026" */
export function formatDateDisplay(dateStr: string): string {
  const date = parseISODate(dateStr);
  return format(date, 'EEEE, MMMM d, yyyy');
}

export function getPreviousDate(isoDate: string): string {
  return formatDateISO(subDays(parseISODate(isoDate), 1));
}

export function getNextDate(isoDate: string): string {
  return formatDateISO(addDays(parseISODate(isoDate), 1));
}

export function isFutureDate(isoDate: string): boolean {
  const todayISO = formatDateISO(getTodayCST());
  return isAfter(parseISODate(isoDate), parseISODate(todayISO));
}

/** Returns true only if dateStr is a real calendar date (rejects month 13, day 32, etc.) */
export function isValidISODate(dateStr: string): boolean {
  const d = parse(dateStr, 'yyyy-MM-dd', new Date());
  return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') === dateStr;
}

/** Format a Date as DDMMYY for CatholicGallery URL */
export function isoToCatholicGallery(isoDate: string): string {
  return format(parseISODate(isoDate), 'ddMMyy');
}
