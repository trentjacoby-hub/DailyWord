import { NextRequest, NextResponse } from 'next/server';
import { ensureDayReadings } from '@/lib/dayData';
import { getLastKvError } from '@/lib/storage';
import { isFutureDate, isValidISODate } from '@/lib/dates';

export const runtime = 'nodejs';
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
    // Cache-only for every date, including today. Readings are generated
    // exclusively by /api/ingest (see scripts/README.md), so a miss here means
    // "not pushed yet", not "go and fetch it".
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

    // Production logs aren't reachable from the dev machine, so
    // ?debug=<INGEST_SECRET|CRON_SECRET> surfaces the real cause. Gated, so a
    // public caller still sees only the generic message.
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
                lastKvError: getLastKvError(),
              },
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
