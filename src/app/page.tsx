import { getTodayCST, formatDateISO } from '@/lib/dates';
import { getReadings, getProcessedDates } from '@/lib/storage';
import { fetchReadingsForDate } from '@/lib/fetchReadings';
import { analyzeReadings } from '@/lib/analyzeReadings';
import { saveReadings } from '@/lib/storage';
import DayView from '@/components/DayView';

// Revalidate page once a day (86400 seconds)
export const revalidate = 86400;

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
