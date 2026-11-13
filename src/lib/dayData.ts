import { DayReadings, ReadingAnalysis } from '@/types';
import {
  getReadings,
  saveReadings,
  acquireAnalysisLock,
  releaseAnalysisLock,
  bumpAnalysisCallCount,
  releaseAnalysisCallSlot,
  getAnalysisCallCount,
} from './storage';
import {
  analyzeOneReading,
  generateOverallMessage,
  blankAnalysis,
  isReadingAnalyzed,
  readingKey,
  type CallGate,
} from './analyzeReadings';

/**
 * Spend headroom, in Claude CALLS, on top of the minimum a date needs.
 *
 * A date needs exactly (readings + 1) calls: one per reading plus the unifying
 * reflection. Work that succeeds is persisted immediately and never requested
 * again, so this headroom is only ever consumed by pieces that actually failed
 * — it cannot be spent re-doing something already paid for.
 *
 * Worst case per date is therefore (readings + 1 + 3) calls, and the normal
 * case is exactly (readings + 1).
 */
const RETRY_HEADROOM = 3;

export type IngestStatus =
  | 'analyzed'
  | 'analyzed_partial'
  | 'already_complete'
  | 'no_readings'
  | 'locked'
  | 'cap_reached';

/** Complete = every reading analyzed AND the unifying reflection present. */
function isComplete(day: DayReadings | null): day is DayReadings {
  if (!day || day.readings.length === 0 || !day.analysis) return false;
  if (!day.analysis.overallMessage?.trim()) return false;
  return day.readings.every((r) => {
    const a = day.analysis!.readings.find((x) => x.readingTitle === readingKey(r));
    return isReadingAnalyzed(a);
  });
}

/**
 * Carry any analysis already stored for this date onto a freshly scraped day,
 * so previously paid-for work survives a re-push of the same date.
 */
function mergeStoredAnalysis(fresh: DayReadings, stored: DayReadings | null): DayReadings {
  if (!stored?.analysis) return fresh;
  return { ...fresh, analysis: stored.analysis };
}

function priorFor(day: DayReadings, key: string): ReadingAnalysis | undefined {
  return day.analysis?.readings.find((a) => a.readingTitle === key);
}

/**
 * Analyze and store a day, resuming rather than restarting.
 *
 * This is the single paid code path, reached from /api/ingest. Guarantees:
 *  - a reading whose analysis is already stored is NEVER re-requested;
 *  - every success is persisted immediately, so a later failure cannot discard
 *    work that was already billed;
 *  - total Claude calls for a date are hard-capped (see RETRY_HEADROOM), with
 *    the counter incremented before each request under a per-date lock.
 */
export async function analyzeAndSaveDay(
  day: DayReadings,
  opts: { force?: boolean } = {}
): Promise<{ status: IngestStatus; day: DayReadings; detail?: string[] }> {
  if (day.readings.length === 0) return { status: 'no_readings', day };

  const stored = await getReadings(day.date);
  let working = mergeStoredAnalysis(day, stored);
  if (isComplete(working) && !opts.force) {
    return { status: 'already_complete', day: working };
  }

  const gotLock = await acquireAnalysisLock(day.date);
  if (!gotLock) return { status: 'locked', day: working };

  try {
    // Re-check under the lock: another worker may have finished meanwhile.
    working = mergeStoredAnalysis(day, await getReadings(day.date));
    if (isComplete(working) && !opts.force) {
      return { status: 'already_complete', day: working };
    }

    const budget = working.readings.length + 1 + RETRY_HEADROOM;
    // Reserve a slot before each request; hand it back if the budget says no,
    // so the counter stays an honest count of requests actually issued.
    const gate: CallGate = async () => {
      const n = await bumpAnalysisCallCount(working.date);
      if (n <= budget) return true;
      await releaseAnalysisCallSlot(working.date);
      return false;
    };

    const notes: string[] = [];

    // Readings are analyzed IN PARALLEL. Doing them sequentially makes total
    // latency the SUM of the calls, which overruns the 60s function limit on a
    // 3-reading Sunday; in parallel it is the slowest single call.
    //
    // Parallelism is safe here precisely because analyzeOneReading never
    // throws: there is no all-or-nothing Promise.all semantics to lose work to.
    // The budget gate is a single atomic INCR, so concurrent reservations are
    // still counted exactly.
    const results: ReadingAnalysis[] = new Array(working.readings.length);

    // Saves are serialized through this chain so concurrent completions cannot
    // interleave and clobber each other on the same KV key, while still
    // persisting each result as soon as it lands.
    let saveChain: Promise<void> = Promise.resolve();
    const persist = (): Promise<void> => {
      saveChain = saveChain.then(async () => {
        working.analysis = {
          readings: results.filter(Boolean),
          overallMessage: working.analysis?.overallMessage ?? '',
          analyzedAt: new Date().toISOString(),
        };
        await saveReadings(working);
      });
      return saveChain;
    };

    await Promise.all(
      working.readings.map(async (reading, i) => {
        const key = readingKey(reading);
        const prior = priorFor(working, key);

        // Already paid for — reuse, never re-request.
        if (isReadingAnalyzed(prior) && !opts.force) {
          results[i] = prior!;
          return;
        }

        const { analysis, reason } = await analyzeOneReading(
          reading,
          working.liturgicalTitle,
          gate
        );

        if (analysis) {
          results[i] = analysis;
          // Persist this success immediately so a later failure, or the
          // function being killed, cannot discard work already billed.
          await persist();
        } else {
          results[i] = prior ?? blankAnalysis(key);
          notes.push(`${key}: ${reason ?? 'failed'}`);
        }
      })
    );

    await saveChain;
    await persist();

    // Unifying reflection, only if it isn't already stored.
    if (!working.analysis?.overallMessage?.trim() || opts.force) {
      const { message, reason } = await generateOverallMessage(
        working.liturgicalTitle,
        results,
        gate
      );
      if (message) {
        working.analysis = { ...working.analysis!, overallMessage: message };
        await saveReadings(working);
      } else {
        notes.push(`overall message: ${reason ?? 'failed'}`);
      }
    }

    const complete = isComplete(working);
    const callsUsed = await getAnalysisCallCount(working.date);

    if (!complete && notes.length) {
      console.error(
        `[dayData] ${working.date} incomplete after ${callsUsed}/${budget} calls: ${notes.join(' | ')}`
      );
    } else {
      console.log(`[dayData] ${working.date} complete using ${callsUsed}/${budget} calls`);
    }

    if (!complete && callsUsed >= budget) {
      return { status: 'cap_reached', day: working, detail: notes };
    }
    return {
      status: complete ? 'analyzed' : 'analyzed_partial',
      day: working,
      detail: notes.length ? notes : undefined,
    };
  } finally {
    await releaseAnalysisLock(day.date);
  }
}

/**
 * Cache-only read for the request path, for every date including today.
 *
 * Nothing in a user request scrapes or analyzes: CatholicGallery's Cloudflare
 * returns 403 to Vercel IPs, and generation happens exclusively through
 * /api/ingest, fed by a machine on a residential connection. A miss here means
 * "not pushed yet", not "go and fetch it". See scripts/README.md.
 */
export async function ensureDayReadings(isoDate: string): Promise<DayReadings | null> {
  // Belt-and-braces against a null read being mistaken for "no data". The known
  // cause (Next caching @vercel/kv's fetch) is fixed in storage.ts; this second
  // read costs one KV round trip only on a miss.
  const cached = await getReadings(isoDate);
  return cached === null ? await getReadings(isoDate) : cached;
}
