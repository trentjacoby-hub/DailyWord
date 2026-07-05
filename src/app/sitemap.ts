import type { MetadataRoute } from 'next';
import { getProcessedDates } from '@/lib/storage';
import { getTodayCST, formatDateISO } from '@/lib/dates';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const todayISO = formatDateISO(getTodayCST());

  let dates: string[] = [];
  try {
    dates = await getProcessedDates();
  } catch {
    dates = [];
  }

  const home: MetadataRoute.Sitemap[number] = {
    url: SITE_URL,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 1,
  };

  const archive: MetadataRoute.Sitemap = dates
    .filter((date) => date !== todayISO)
    .map((date) => ({
      url: `${SITE_URL}/${date}`,
      lastModified: new Date(date),
      changeFrequency: 'yearly',
      priority: 0.6,
    }));

  return [home, ...archive];
}
