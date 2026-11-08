import { NextRequest, NextResponse } from 'next/server';
import { ensureDayReadings } from '@/lib/dayData';
import { getReadings, getLastKvError } from '@/lib/storage';
import { isFutureDate, isValidISODate, getTodayCST, formatDateISO } from '@/lib/dates';

export const runtime = 'nodejs';
// See [date]/page.tsx — without this, cached Upstash fetches hide days that
// were written by /api/ingest after this route last ran.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { date: string } }
) {
  const { date } = params;

  // Validate format and calendar correctness (rejects month 13, day 32, etc.)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate(date)) {
    return NextResponse.json({ error: 'Invalid date. Use YYYY-MM-DD.' }, { status: 400 });
  }

  if (isFutureDate(date)) {
    return NextResponse.json({ error: 'Date is in the future.' }, { status: 400 });
  }

  try {
    // Today generates on demand (lock-guarded); past dates are cache-only, so
    // an uncached past date returns null here and we 404 instead of analyzing.
    const dayReadings = await ensureDayReadings(date);
    if (!dayReadings || dayReadings.readings.length === 0) {
      return NextResponse.json(
        { error: 'Readings not available for this date.' },
        { status: 404 }
      );
    }
    return NextResponse.json(dayReadings);
  } catch (err) {
    console.error('[readings API]', err);

    // Secret-gated detail. Production logs are not readable from the dev
    // machine, so ?debug=<INGEST_SECRET|CRON_SECRET> surfaces the real cause.
    // Gated so a public caller still only sees the generic message.
    const secret = process.env.INGEST_SECRET || process.env.CRON_SECRET;
    const wantsDebug = !!secret && req.nextUrl.searchParams.get('debug') === secret;

    return NextResponse.json(
      {
        error: 'Failed to fetch or analyze readings.',
        ...(wantsDebug
          ? {
              debug: {
                message: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack?.split(/\r?\n/).slice(0, 6) : undefined,
                kvUrlHost: (() => {
                  try { return new URL(process.env.KV_REST_API_URL ?? '').host; } catch { return null; }
                })(),
                hasKvToken: !!process.env.KV_REST_API_TOKEN,
                serverToday: new Date().toISOString(),
                lastKvError: getLastKvError(),
                serverTZ: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                todayISO: formatDateISO(getTodayCST()),
                requestedDate: date,
                datesMatch: date === formatDateISO(getTodayCST()),
                isCompleteNow: await (async () => {
                  const v = await getReadings(date);
                  return {
                    truthy: !!v,
                    hasAnalysis: !!v?.analysis,
                    readingsLen: v?.readings?.length ?? null,
                    verdict: !!v && !!v.analysis && v.readings.length > 0,
                  };
                })(),
                // What does the app's own KV client actually see for this key?
                kvRead: await (async () => {
                  try {
                    const v = await getReadings(date);
                    if (!v) return null;
                    return {
                      keys: Object.keys(v),
                      readings: Array.isArray(v.readings) ? v.readings.length : 'not-array',
                      hasAnalysis: !!v.analysis,
                    };
                  } catch (e) {
                    return { threw: e instanceof Error ? e.message : String(e) };
                  }
                })(),
                // And what does a raw REST call to the same DB return?
                rawKv: await (async () => {
                  try {
                    const res = await fetch(
                      `${process.env.KV_REST_API_URL}/get/readings:${date}`,
                      {
                        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
                        cache: 'no-store',
                      }
                    );
                    const j = await res.json();
                    const v = j?.result;
                    const str = typeof v === 'string' ? v : v == null ? null : JSON.stringify(v);
                    return { status: res.status, len: str ? str.length : 0, head: str ? str.slice(0, 50) : null };
                  } catch (e) {
                    return { threw: e instanceof Error ? e.message : String(e) };
                  }
                })(),
              },
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
