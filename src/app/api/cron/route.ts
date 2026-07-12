import { NextRequest, NextResponse } from 'next/server';
import { ensureDayReadings } from '@/lib/dayData';
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

  try {
    // Idempotent + lock-guarded: skips if already analyzed, and won't collide
    // with an on-demand analysis triggered by a visitor.
    const dayReadings = await ensureDayReadings(isoDate);

    if (!dayReadings || dayReadings.readings.length === 0) {
      // Source hasn't published yet — a later cron or visit will retry.
      return NextResponse.json({ status: 'no_readings', date: isoDate });
    }

    return NextResponse.json({ status: 'success', date: isoDate });
  } catch (err) {
    console.error('[cron]', err);
    return NextResponse.json({ status: 'error', message: String(err) }, { status: 500 });
  }
}
