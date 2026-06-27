import { kv } from '@vercel/kv';
import { DayReadings } from '@/types';

const READINGS_PREFIX = 'readings:';
const DATES_INDEX_KEY = 'dates:index';
const MAX_STORED_DAYS = 365;

export async function getReadings(isoDate: string): Promise<DayReadings | null> {
  try {
    return await kv.get<DayReadings>(`${READINGS_PREFIX}${isoDate}`);
  } catch {
    return null;
  }
}

export async function saveReadings(dayReadings: DayReadings): Promise<void> {
  await kv.set(`${READINGS_PREFIX}${dayReadings.date}`, dayReadings);

  // Maintain a sorted index of processed dates (most-recent first)
  const dates = (await kv.get<string[]>(DATES_INDEX_KEY)) ?? [];
  if (!dates.includes(dayReadings.date)) {
    dates.push(dayReadings.date);
    dates.sort((a, b) => b.localeCompare(a)); // descending
    await kv.set(DATES_INDEX_KEY, dates.slice(0, MAX_STORED_DAYS));
  }
}

/** Returns dates in descending order (newest first) */
export async function getProcessedDates(): Promise<string[]> {
  return (await kv.get<string[]>(DATES_INDEX_KEY)) ?? [];
}
