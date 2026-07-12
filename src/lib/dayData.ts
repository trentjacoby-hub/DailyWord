import { DayReadings } from '@/types';
import {
  getReadings,
  saveReadings,
  acquireAnalysisLock,
  releaseAnalysisLock,
  bumpDailyAnalysisCount,
} from './storage';
import { fetchReadingsForDate } from './fetchReadings';
import { analyzeReadings } from './analyzeReadings';
import { getTodayCST, formatDateISO } from './dates';

// Absolute ceiling on paid analyses per day. A normal day needs exactly one
// (the midnight cron); the headroom covers a single retry if a scrape was empty
// then republished. Because ALL Claude spend flows through the single call site
// below, this caps worst-case daily cost no matter what bug or abuse path reaches it.
const MAX_DAILY_ANALYSES = 2;

function isComplete(day: DayReadings | null): day is DayReadings {
  return !!day && !!day.analysis && day.readings.length > 0;
}

/**
 * Returns a day's readings with analysis.
 *
 * On-demand fetch + Claude analysis happens ONLY for today (and via the cron).
 * Past dates are cache-only: if a past date isn't already stored, this returns
 * null rather than analyzing it. That closes the token hole where any visitor or
 * crawler hitting a `/YYYY-MM-DD` URL could trigger a paid analysis for every
 * date in the calendar range. Legit users never hit this — the "Previous" button
 * is disabled for dates that aren't already cached.
 *
 * For today, a per-date KV lock ensures at most one analysis runs even under
 * concurrent requests.
 */
export async function ensureDayReadings(isoDate: string): Promise<DayReadings | null> {
  const cached = await getReadings(isoDate);
  if (isComplete(cached)) return cached;

  const todayISO = formatDateISO(getTodayCST());
  if (isoDate !== todayISO) {
    // Past date with no complete cache → do NOT generate on demand.
    return cached;
  }

  // Today only: generate on demand, guarded so one worker analyzes at a time.
  const gotLock = await acquireAnalysisLock(isoDate);
  if (!gotLock) {
    // Another request is analyzing today — serve cache, else a readings-only
    // scrape (no analysis, no Claude cost).
    return cached ?? (await fetchReadingsForDate(isoDate));
  }

  try {
    // Re-check: another worker may have finished between our read and the lock.
    const fresh = await getReadings(isoDate);
    if (isComplete(fresh)) return fresh;

    const day = await fetchReadingsForDate(isoDate);

    // Don't burn an analysis on an empty scrape (source not published yet).
    // Leave it unsaved so a later request retries once the readings appear.
    if (day.readings.length === 0) return day;

    // Absolute safety cap. Incremented under the lock (today-only path), so it's
    // race-free. Once the daily ceiling is hit we serve readings WITHOUT analysis
    // rather than spend — a hard stop that bounds cost even if everything else fails.
    const attempt = await bumpDailyAnalysisCount(isoDate);
    if (attempt > MAX_DAILY_ANALYSES) {
      console.error(
        `[dayData] daily analysis cap (${MAX_DAILY_ANALYSES}) hit for ${isoDate}; ` +
          `serving readings without analysis (attempt ${attempt})`
      );
      return day;
    }
    console.log(`[dayData] analyzing ${isoDate} (attempt ${attempt}/${MAX_DAILY_ANALYSES})`);

    day.analysis = await analyzeReadings(day);
    await saveReadings(day);
    return day;
  } finally {
    await releaseAnalysisLock(isoDate);
  }
}
