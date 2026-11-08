import { getTodayCST, formatDateISO, formatDateDisplay } from '@/lib/dates';
import { getReadings, getProcessedDates } from '@/lib/storage';
import { ensureDayReadings } from '@/lib/dayData';
import DayView from '@/components/DayView';
import type { DayReadings } from '@/types';
import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Give on-demand analysis room to finish and save, so it isn't killed mid-call
// and retried (which would waste tokens). Matches the API routes.
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const todayISO = formatDateISO(getTodayCST());
  const displayDate = formatDateDisplay(todayISO);

  // Read-only cache lookup — never triggers the fetch/analyze path.
  const cached = await getReadings(todayISO);
  const liturgical = cached?.liturgicalTitle;

  const title = liturgical
    ? `${liturgical} — ${displayDate}`
    : `Today's Catholic Mass Readings — ${displayDate}`;

  const description = liturgical
    ? `Today's Catholic Mass readings and reflections for ${liturgical} (${displayDate}) — the First Reading, Responsorial Psalm, and Gospel, each with a plain-English reflection.`
    : `Today's Catholic Mass readings with AI-powered reflections following the liturgical calendar.`;

  return {
    // Home keeps the site name as the canonical title; the daily context lives
    // in Open Graph/Twitter so shared links show the day without renaming the tab brand.
    title: { absolute: `${SITE_NAME} — ${displayDate}` },
    description,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', title, description, url: '/' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function HomePage() {
  const today = getTodayCST();
  const isoDate = formatDateISO(today);

  // Returns cached readings+analysis, or fetches/analyzes on demand — guarded by
  // a per-date lock so we never pay for more than one analysis per day.
  const emptyDay: DayReadings = { date: isoDate, liturgicalTitle: 'Daily Readings', readings: [] };
  let dayReadings: DayReadings;
  try {
    // Homepage is always today, so this generates on demand if needed.
    dayReadings = (await ensureDayReadings(isoDate)) ?? emptyDay;
  } catch (err) {
    // Fall back to whatever is cached rather than crashing the page — but say
    // why. Swallowing this silently is what hid the Cloudflare block on the
    // readings source for a week in Sept 2026.
    console.error(`[home] ensureDayReadings failed for ${isoDate}:`, err);
    dayReadings = (await getReadings(isoDate)) ?? emptyDay;
  }

  const availableDates = await getProcessedDates();

  return <DayView dayReadings={dayReadings} availableDates={availableDates} />;
}
