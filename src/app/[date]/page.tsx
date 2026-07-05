import { notFound } from 'next/navigation';
import { getReadings, saveReadings, getProcessedDates } from '@/lib/storage';
import { fetchReadingsForDate } from '@/lib/fetchReadings';
import { analyzeReadings } from '@/lib/analyzeReadings';
import { isFutureDate, isValidISODate, formatDateDisplay } from '@/lib/dates';
import DayView from '@/components/DayView';
import type { Metadata } from 'next';

interface Props {
  params: { date: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = params;

  if (!isValidISODate(date) || isFutureDate(date)) {
    return { title: 'Readings', alternates: { canonical: `/${date}` } };
  }

  const displayDate = formatDateDisplay(date);

  // Read-only cache lookup so the title/description can include the liturgical
  // day when it's already stored — never triggers a fetch or analysis.
  const cached = await getReadings(date);
  const liturgical = cached?.liturgicalTitle;

  const title = liturgical
    ? `${liturgical} — ${displayDate}`
    : `Catholic Mass Readings for ${displayDate}`;

  const description = liturgical
    ? `Catholic Mass readings and reflections for ${liturgical} (${displayDate}) — the First Reading, Responsorial Psalm, and Gospel, with a plain-English reflection on each.`
    : `Catholic Mass readings and AI-powered reflections for ${displayDate}.`;

  return {
    title,
    description,
    alternates: { canonical: `/${date}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/${date}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function DatePage({ params }: Props) {
  const { date } = params;

  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  // Don't serve future dates
  if (isFutureDate(date)) notFound();

  let dayReadings = await getReadings(date);

  if (!dayReadings || dayReadings.readings.length === 0) {
    try {
      dayReadings = await fetchReadingsForDate(date);
      dayReadings.analysis = await analyzeReadings(dayReadings);
      await saveReadings(dayReadings);
    } catch {
      notFound();
    }
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
