import { NextRequest, NextResponse } from 'next/server';
import { getReadings, saveReadings } from '@/lib/storage';
import { fetchReadingsForDate } from '@/lib/fetchReadings';
import { analyzeReadings } from '@/lib/analyzeReadings';
import { getTodayCST, formatDateISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Called automatically at 6:00 AM UTC = midnight CST (12:00 AM CST).
 * Schedule is defined in vercel.json.
 *
 * Protected by CRON_SECRET env variable.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = getTodayCST();
  const isoDate = formatDateISO(today);

  // Skip if already processed
  const existing = await getReadings(isoDate);
  if (existing?.analysis) {
    return NextResponse.json({ status: 'already_done', date: isoDate });
  }

  try {
    const dayReadings = await fetchReadingsForDate(isoDate);
    dayReadings.analysis = await analyzeReadings(dayReadings);
    await saveReadings(dayReadings);

    return NextResponse.json({ status: 'success', date: isoDate });
  } catch (err) {
    console.error('[cron]', err);
    return NextResponse.json({ status: 'error', message: String(err) }, { status: 500 });
  }
}
