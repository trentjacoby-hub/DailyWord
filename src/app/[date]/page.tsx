import { notFound } from 'next/navigation';
import { getReadings, saveReadings, getProcessedDates } from '@/lib/storage';
import { fetchReadingsForDate } from '@/lib/fetchReadings';
import { analyzeReadings } from '@/lib/analyzeReadings';
import { isFutureDate } from '@/lib/dates';
import DayView from '@/components/DayView';
import type { Metadata } from 'next';

interface Props {
  params: { date: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Readings for ${params.date} — Daily Word`,
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
