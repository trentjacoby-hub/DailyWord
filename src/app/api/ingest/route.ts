import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { parseReadingsHtml } from '@/lib/fetchReadings';
import { analyzeAndSaveDay } from '@/lib/dayData';
import { isValidISODate, isFutureDate } from '@/lib/dates';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Upstream pages run ~180KB. Anything far beyond that is not a readings page.
const MAX_HTML_BYTES = 2_000_000;

function expectedSecret(): string | undefined {
  // Prefer a dedicated secret, but fall back to CRON_SECRET so this works with
  // no extra Vercel env config. Both are the same trust level: "may trigger a
  // paid analysis for one date", bounded by the per-date cap in dayData.
  return process.env.INGEST_SECRET || process.env.CRON_SECRET;
}

function authorized(req: NextRequest): boolean {
  const secret = expectedSecret();
  if (!secret) return false;

  const header = req.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Ingest endpoint for home-machine push clients.
 *
 * Why this exists: CatholicGallery sits behind Cloudflare, which blocks Vercel's
 * datacenter egress IPs (started 2026-09-13), so the server cannot scrape the
 * source itself. A machine on a residential connection fetches the raw HTML and
 * POSTs it here; parsing and the Claude analysis still happen server-side, so
 * the push clients stay dumb, dependency-free and interchangeable.
 *
 * Body: { date: "YYYY-MM-DD", html: "<!doctype html>...", force?: boolean }
 * Auth: Authorization: Bearer <INGEST_SECRET || CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { date?: unknown; html?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const { date, html, force } = body;

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate(date)) {
    return NextResponse.json({ error: 'Invalid or missing "date" (YYYY-MM-DD).' }, { status: 400 });
  }
  if (isFutureDate(date)) {
    return NextResponse.json({ error: 'Date is in the future.' }, { status: 400 });
  }
  if (typeof html !== 'string' || html.length === 0) {
    return NextResponse.json({ error: 'Missing "html".' }, { status: 400 });
  }
  if (html.length > MAX_HTML_BYTES) {
    return NextResponse.json({ error: 'HTML too large.' }, { status: 413 });
  }

  try {
    const day = parseReadingsHtml(html, date);

    if (day.readings.length === 0) {
      // Either the source hasn't published yet, or the markup changed and the
      // parser needs updating. Either way: do not spend, and say so loudly.
      console.error(`[ingest] parsed 0 readings for ${date} from ${html.length} bytes of HTML`);
      return NextResponse.json(
        { status: 'no_readings', date, hint: 'Parsed 0 readings — source unpublished or markup changed.' },
        { status: 422 }
      );
    }

    const { status, day: saved } = await analyzeAndSaveDay(day, { force: force === true });

    console.log(`[ingest] ${date} → ${status} (${day.readings.length} readings)`);

    return NextResponse.json({
      status,
      date,
      liturgicalTitle: saved.liturgicalTitle,
      readings: saved.readings.map((r) => `${r.title} — ${r.reference}`),
      analyzed: !!saved.analysis,
    });
  } catch (err) {
    console.error('[ingest]', err);
    return NextResponse.json(
      { status: 'error', date, message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
