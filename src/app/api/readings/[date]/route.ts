import { NextRequest, NextResponse } from 'next/server';
import { getReadings, saveReadings } from '@/lib/storage';
import { fetchReadingsForDate } from '@/lib/fetchReadings';
import { analyzeReadings } from '@/lib/analyzeReadings';
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
    // Try cache first
    let dayReadings = await getReadings(date);

    if (!dayReadings || dayReadings.readings.length === 0) {
      // Fetch and analyze (also re-fetches if a prior scrape returned empty readings)
      dayReadings = await fetchReadingsForDate(date);
      dayReadings.analysis = await analyzeReadings(dayReadings);
      await saveReadings(dayReadings);
    } else if (!dayReadings.analysis) {
      dayReadings.analysis = await analyzeReadings(dayReadings);
      await saveReadings(dayReadings);
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
