import * as cheerio from 'cheerio';
import { DayReadings, Reading } from '@/types';
import { isoToUSCCB } from './dates';

const VALID_TITLES = ['Reading 1', 'Reading 2', 'Responsorial Psalm', 'Alleluia', 'Gospel'];

export async function fetchReadingsForDate(isoDate: string): Promise<DayReadings> {
  const usccbDate = isoToUSCCB(isoDate);
  const url = `https://bible.usccb.org/bible/readings/${usccbDate}.cfm`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`USCCB fetch failed: HTTP ${response.status} for ${isoDate}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // ── Liturgical title ────────────────────────────────────────────────────────
  // First <h2> that isn't the site header
  let liturgicalTitle = '';
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text !== 'Daily Readings' && !text.toLowerCase().includes('dive into')) {
      liturgicalTitle = text;
      return false; // break
    }
  });

  // ── Readings ─────────────────────────────────────────────────────────────────
  const readings: Reading[] = [];

  $('h3').each((_, h3) => {
    const title = $(h3).text().trim();
    if (!VALID_TITLES.some((t) => title === t || title.startsWith(t + ' '))) return;

    let reference = '';
    const textParts: string[] = [];

    let sibling = $(h3).next();
    while (sibling.length && !sibling.is('h3') && !sibling.is('h2')) {
      const tag = sibling.prop('tagName')?.toLowerCase();

      if (tag === 'p' || tag === 'blockquote') {
        // First paragraph with a USCCB bible link = the scripture reference
        if (!reference) {
          const link = sibling.find('a[href*="bible.usccb.org"]').first();
          if (link.length) {
            reference = link.text().trim();
            sibling = sibling.next();
            continue;
          }
        }
        const text = sibling.text().trim();
        if (text) textParts.push(text);
      }

      sibling = sibling.next();
    }

    if (textParts.length > 0) {
      readings.push({
        title,
        reference: reference || title,
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
