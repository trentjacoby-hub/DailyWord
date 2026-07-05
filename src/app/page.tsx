import { getTodayCST, formatDateISO, formatDateDisplay } from '@/lib/dates';
import { getReadings, getProcessedDates } from '@/lib/storage';
import { fetchReadingsForDate } from '@/lib/fetchReadings';
import { analyzeReadings } from '@/lib/analyzeReadings';
import { saveReadings } from '@/lib/storage';
import DayView from '@/components/DayView';
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

  let dayReadings = await getReadings(isoDate);

  // If not yet cached, or cached with empty readings (bad scrape), fetch + analyze now
  if (!dayReadings || dayReadings.readings.length === 0) {
    dayReadings = await fetchReadingsForDate(isoDate);
    dayReadings.analysis = await analyzeReadings(dayReadings);
    await saveReadings(dayReadings);
  } else if (!dayReadings.analysis) {
    try {
      dayReadings.analysis = await analyzeReadings(dayReadings);
      await saveReadings(dayReadings);
    } catch {
      // serve cached readings without analysis rather than crashing the page
    }
  }

  const availableDates = await getProcessedDates();

  return <DayView dayReadings={dayReadings} availableDates={availableDates} />;
}
