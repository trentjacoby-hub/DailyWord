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

const LOCK_PREFIX = 'lock:analyze:';
const LOCK_TTL_SECONDS = 120; // > function maxDuration (60s), so a crashed worker's lock auto-expires

/**
 * Acquire a short-lived per-date lock so only one worker fetches/analyzes a day.
 * Returns true if the lock was acquired, false if another worker already holds it.
 */
export async function acquireAnalysisLock(isoDate: string): Promise<boolean> {
  const res = await kv.set(`${LOCK_PREFIX}${isoDate}`, '1', { nx: true, ex: LOCK_TTL_SECONDS });
  return res !== null; // 'OK' when set, null when the key already exists
}

export async function releaseAnalysisLock(isoDate: string): Promise<void> {
  await kv.del(`${LOCK_PREFIX}${isoDate}`);
}

const ANALYSIS_COUNT_PREFIX = 'analyze:count:';
const ANALYSIS_COUNT_TTL_SECONDS = 60 * 60 * 48; // 2 days — the per-date key resets daily

/**
 * Atomically increment and return the number of analyses attempted for a date.
 * Used as an absolute daily spend cap: the caller refuses to analyze once this
 * exceeds the configured limit, bounding worst-case cost regardless of cause.
 */
export async function bumpDailyAnalysisCount(isoDate: string): Promise<number> {
  const key = `${ANALYSIS_COUNT_PREFIX}${isoDate}`;
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, ANALYSIS_COUNT_TTL_SECONDS);
  }
  return count;
}
