import { DayReadings } from '@/types';
import {
  getReadings,
  saveReadings,
  acquireAnalysisLock,
  releaseAnalysisLock,
  bumpDailyAnalysisCount,
} from './storage';
import { analyzeReadings } from './analyzeReadings';

// Absolute ceiling on paid analyses per DATE. A normal day needs exactly one;
// the headroom covers a single retry if a scrape was empty then republished, and
// lets a second push client (e.g. a backup machine) trigger the same day safely.
// Because ALL Claude spend flows through the single call site below, this caps
// worst-case cost per date no matter what bug or abuse path reaches it.
const MAX_DAILY_ANALYSES = 2;

export type IngestStatus =
  | 'analyzed'
  | 'already_complete'
  | 'no_readings'
  | 'locked'
  | 'cap_reached';

function isComplete(day: DayReadings | null): day is DayReadings {
  return !!day && !!day.analysis && day.readings.length > 0;
}

/**
 * Analyze and store an already-scraped day.
 *
 * This is the single paid code path. Both entry points funnel through it:
 *  - /api/ingest, when a home machine pushes HTML it scraped (the working route)
 *  - ensureDayReadings, when the server scrapes directly (blocked in prod today)
 *
 * Idempotent and lock-guarded, so running it twice for the same date — two push
 * machines, or a push racing the cron — costs nothing the second time.
 */
export async function analyzeAndSaveDay(
  day: DayReadings,
  opts: { force?: boolean } = {}
): Promise<{ status: IngestStatus; day: DayReadings }> {
  if (day.readings.length === 0) return { status: 'no_readings', day };

  const existing = await getReadings(day.date);
  if (isComplete(existing) && !opts.force) {
    return { status: 'already_complete', day: existing };
  }

  const gotLock = await acquireAnalysisLock(day.date);
  if (!gotLock) return { status: 'locked', day };

  try {
    // Re-check: another worker may have finished between our read and the lock.
    const fresh = await getReadings(day.date);
    if (isComplete(fresh) && !opts.force) {
      return { status: 'already_complete', day: fresh };
    }

    // Absolute safety cap, incremented under the lock so it's race-free. The
    // counter is per-date, so a backfill of old dates each get their own budget.
    // `force` does NOT bypass this — it only permits re-analyzing a complete day.
    const attempt = await bumpDailyAnalysisCount(day.date);
    if (attempt > MAX_DAILY_ANALYSES) {
      console.error(
        `[dayData] analysis cap (${MAX_DAILY_ANALYSES}) hit for ${day.date}; ` +
          `refusing to spend (attempt ${attempt})`
      );
      return { status: 'cap_reached', day };
    }
    console.log(`[dayData] analyzing ${day.date} (attempt ${attempt}/${MAX_DAILY_ANALYSES})`);

    day.analysis = await analyzeReadings(day);
    await saveReadings(day);
    return { status: 'analyzed', day };
  } finally {
    await releaseAnalysisLock(day.date);
  }
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
 */
let lastDecision: Record<string, unknown> | null = null;
export function getLastDecision() {
  return lastDecision;
}

export async function ensureDayReadings(isoDate: string): Promise<DayReadings | null> {
  // Read-your-write guard. A first kv.get in a request has been observed
  // returning null for a key that exists (confirmed in prod: the same key read
  // again ~1s later in the same request returns the full record). Treat a null
  // on the first read as inconclusive and confirm before acting on it.
  let cached = await getReadings(isoDate);
  if (cached === null) {
    cached = await getReadings(isoDate);
  }

  const complete = isComplete(cached);
  lastDecision = {
    isoDate,
    cachedTruthy: !!cached,
    hasAnalysis: !!cached?.analysis,
    readingsLen: Array.isArray(cached?.readings) ? cached!.readings.length : null,
    complete,
    at: new Date().toISOString(),
  };

  // Cache-only in the request path, for every date including today.
  //
  // The direct scrape cannot work from Vercel -- CatholicGallery's Cloudflare
  // returns 403 to datacenter IPs (confirmed in prod). Attempting it here only
  // converted "not ready yet" into a thrown 403, which surfaced as a 500 on
  // this API and a 404 on /[date] for days that were actually present.
  // Generation happens exclusively through /api/ingest, fed by a machine on a
  // residential connection. See scripts/README.md.
  return cached;
}
