import { NextRequest, NextResponse } from 'next/server';
import { ensureDayReadings } from '@/lib/dayData';
import { isFutureDate, isValidISODate } from '@/lib/dates';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
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
    return NextResponse.json(
      { error: 'Failed to fetch or analyze readings.' },
      { status: 500 }
    );
  }
}
