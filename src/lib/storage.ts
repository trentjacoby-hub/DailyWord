import { createClient } from '@vercel/kv';
import type { RedisConfigNodejs } from '@upstash/redis';

/**
 * KV client that bypasses Next's Data Cache.
 *
 * @vercel/kv's default client sets `cache: "default"` on its fetch (it
 * deliberately overrides @upstash/redis's "no-store"). Under Next 14 that makes
 * every KV read a cacheable fetch, so a read that happened before a key existed
 * is cached as null and served forever after the key is written.
 *
 * That is exactly what broke 2026-11-08: the key was read at 16:28, written at
 * 16:34 by /api/ingest, and every later read in a cacheable request kept
 * returning the cached null -- while a raw REST GET to the same database
 * returned the record. `cache: "no-store"` makes reads always hit Upstash.
 *
 * `cache` is a valid fetch option passed through to the underlying client but
 * is absent from RedisConfigNodejs, hence the cast.
 */
let _kv: ReturnType<typeof createClient> | null = null;
function getKv() {
  if (!_kv) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error('Missing KV_REST_API_URL / KV_REST_API_TOKEN');
    }
    _kv = createClient({ url, token, cache: 'no-store' } as RedisConfigNodejs & {
      cache: RequestCache;
    });
  }
  return _kv;
}

const kv = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop) {
    return Reflect.get(getKv(), prop);
  },
});
import { DayReadings } from '@/types';

const READINGS_PREFIX = 'readings:';
const DATES_INDEX_KEY = 'dates:index';
const MAX_STORED_DAYS = 365;

// A silently-swallowed KV error here is indistinguishable from "no data", which
// sends callers down the (blocked) scrape path. Record and log it instead.
let lastKvError: { key: string; message: string; at: string } | null = null;
export function getLastKvError() {
  return lastKvError;
}

export async function getReadings(isoDate: string): Promise<DayReadings | null> {
  const key = `${READINGS_PREFIX}${isoDate}`;
  try {
    return await kv.get<DayReadings>(key);
  } catch (err) {
    lastKvError = {
      key,
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      at: new Date().toISOString(),
    };
    console.error(`[storage] kv.get failed for ${key}:`, err);
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

const ANALYSIS_CALL_PREFIX = 'analyze:calls:';
const ANALYSIS_COUNT_TTL_SECONDS = 60 * 60 * 48; // 2 days — the per-date key resets daily

/**
 * Atomically increment and return the number of Claude CALLS made for a date.
 *
 * Calls, not runs, are the unit that costs money. Counting them lets a later
 * run top up the pieces that failed without the budget being spent by pieces
 * that already succeeded (those are never re-requested -- see dayData).
 */
export async function bumpAnalysisCallCount(isoDate: string): Promise<number> {
  const key = `${ANALYSIS_CALL_PREFIX}${isoDate}`;
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, ANALYSIS_COUNT_TTL_SECONDS);
  }
  return count;
}

/**
 * Hand back a slot taken by an INCR that did not result in a request.
 * Safe because every gate call happens under the per-date analysis lock, so
 * there is only one worker incrementing this key at a time.
 */
export async function releaseAnalysisCallSlot(isoDate: string): Promise<void> {
  await kv.decr(`${ANALYSIS_CALL_PREFIX}${isoDate}`);
}

export async function getAnalysisCallCount(isoDate: string): Promise<number> {
  return (await kv.get<number>(`${ANALYSIS_CALL_PREFIX}${isoDate}`)) ?? 0;
}

