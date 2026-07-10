import { getTodayCST, formatDateISO, formatDateDisplay } from '@/lib/dates';
import { getReadings, getProcessedDates } from '@/lib/storage';
import { ensureDayReadings } from '@/lib/dayData';
import DayView from '@/components/DayView';
import type { DayReadings } from '@/types';
import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const dynamic = 'force-dynamic';

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
  let dayReadings: DayReadings;
  try {
    dayReadings = await ensureDayReadings(isoDate);
  } catch {
    // Fall back to whatever is cached rather than crashing the page.
    dayReadings = (await getReadings(isoDate)) ?? {
      date: isoDate,
      liturgicalTitle: 'Daily Readings',
      readings: [],
    };
  }

  const availableDates = await getProcessedDates();

  return <DayView dayReadings={dayReadings} availableDates={availableDates} />;
}
