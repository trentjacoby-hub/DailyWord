import { DayReadings } from '@/types';
import {
  getReadings,
  saveReadings,
  acquireAnalysisLock,
  releaseAnalysisLock,
} from './storage';
import { fetchReadingsForDate } from './fetchReadings';
import { analyzeReadings } from './analyzeReadings';

function isComplete(day: DayReadings | null): day is DayReadings {
  return !!day && !!day.analysis && day.readings.length > 0;
}

/**
 * Returns a day's readings with analysis, fetching and analyzing on demand if
 * needed. A per-date KV lock ensures at most ONE analysis runs per day, even
 * under concurrent requests or an empty-then-published scrape — so we never pay
 * for duplicate Claude analyses. Shared by the cron, the homepage, and the API.
 */
export async function ensureDayReadings(isoDate: string): Promise<DayReadings> {
  const cached = await getReadings(isoDate);
  if (isComplete(cached)) return cached;

  // Only one worker fetches/analyzes at a time. If we can't get the lock,
  // another request is already doing it — serve the cache if we have one,
  // otherwise a readings-only scrape (no analysis, no Claude cost).
  const gotLock = await acquireAnalysisLock(isoDate);
  if (!gotLock) {
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

    day.analysis = await analyzeReadings(day);
    await saveReadings(day);
    return day;
  } finally {
    await releaseAnalysisLock(isoDate);
  }
}
