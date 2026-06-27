import * as cheerio from 'cheerio';
import { DayReadings, Reading } from '@/types';
import { isoToCatholicGallery } from './dates';

const READING_MAP: Record<string, string> = {
  'First Reading': 'Reading 1',
  'Second Reading': 'Reading 2',
  'Gospel': 'Gospel',
};

const SKIP_PREFIXES = ['Responsorial Psalm', 'Alleluia'];

export async function fetchReadingsForDate(isoDate: string): Promise<DayReadings> {
  const cgDate = isoToCatholicGallery(isoDate);
  const url = `https://www.catholicgallery.org/mass-reading/${cgDate}/`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`CatholicGallery fetch failed: HTTP ${response.status} for ${isoDate}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // ── Liturgical title ──────────────────────────────────────────────────────
  // Page structure: h1 = date title, first h2 = liturgical day description,
  // subsequent h2s = reading sections
  const allPrefixes = [...Object.keys(READING_MAP), ...SKIP_PREFIXES];
  let liturgicalTitle = '';
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (!allPrefixes.some((p) => text.startsWith(p + ':'))) {
      // CatholicGallery separates multiple designations with " / " — take the first
      liturgicalTitle = text.split('/')[0].trim();
      return false; // take the first non-reading h2
    }
  });

  // ── Readings ──────────────────────────────────────────────────────────────
  const readings: Reading[] = [];

  $('h2').each((_, h2) => {
    const fullText = $(h2).text().trim();

    const key = Object.keys(READING_MAP).find((k) => fullText.startsWith(k + ':'));
    if (!key) return;

    const reference = fullText.slice(key.length + 2).trim();

    // Text lives in <div class="cg_content"> immediately after the h2
    const textParts: string[] = [];
    $(h2).next('div.cg_content').find('p').each((_, p) => {
      const text = $(p).text().trim();
      if (text) textParts.push(text);
    });

    if (textParts.length > 0) {
      readings.push({
        title: READING_MAP[key],
        reference,
        text: textParts.join('\n\n'),
      });
    }
  });

  return {
    date: isoDate,
    liturgicalTitle: liturgicalTitle || 'Daily Readings',
    readings,
    fetchedAt: new Date().toISOString(),
  };
}
