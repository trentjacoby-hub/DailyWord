import Anthropic from '@anthropic-ai/sdk';
import { Reading, ReadingAnalysis } from '@/types';

// The SDK retries 429s, 5xx and connection errors twice by default. Those
// retried requests are not billed, so transient blips are absorbed before they
// ever cost a budget slot here.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';

/**
 * Gate called immediately before every Claude request. Returns false when the
 * date's call budget is exhausted, in which case the request is not made.
 * Spend accounting lives in dayData/storage; this module never touches KV.
 */
export type CallGate = () => Promise<boolean>;

export function readingKey(reading: Reading): string {
  return `${reading.title} — ${reading.reference}`;
}

export function blankAnalysis(readingTitle: string): ReadingAnalysis {
  return {
    readingTitle,
    summary: '',
    keyTakeaways: [],
    historicalContext: '',
    practicalApplication: '',
  };
}

/** A reading counts as done only if it actually has prose in it. */
export function isReadingAnalyzed(a: ReadingAnalysis | undefined): boolean {
  return !!a && a.summary.trim().length > 0;
}

/**
 * Analyze one reading. Never throws.
 *
 * Returning null (rather than throwing) is the whole point: one failed reading
 * must not discard the readings that already succeeded and were billed. The
 * caller persists each success immediately and can fill the gaps on a later
 * run without re-requesting anything already stored.
 */
export async function analyzeOneReading(
  reading: Reading,
  dayTitle: string,
  gate: CallGate
): Promise<{ analysis: ReadingAnalysis | null; reason?: string }> {
  if (!(await gate())) {
    return { analysis: null, reason: 'budget exhausted' };
  }

  const prompt = `You are a knowledgeable Catholic theologian and spiritual director helping everyday Catholics understand the Mass readings. Your tone is warm, clear, and faithful to Catholic teaching.

Today's liturgical day: ${dayTitle}
Reading: ${reading.title} — ${reading.reference}

Scripture text:
${reading.text}

Analyze this reading. Respond ONLY with a valid JSON object in this exact shape:
{
  "summary": "2–3 sentences in plain modern English explaining what this passage is saying, as if speaking to someone unfamiliar with Biblical language.",
  "keyTakeaways": [
    "First key message or truth the Lord is communicating.",
    "Second key message or truth.",
    "Third key message or truth."
  ],
  "historicalContext": "2–3 sentences about the historical, cultural, or theological background that helps the reader understand the passage more deeply.",
  "practicalApplication": "2–3 sentences on how a Catholic today can concretely apply this reading's message to their daily life."
}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      return { analysis: null, reason: 'unexpected response type' };
    }

    const raw = block.text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return { analysis: null, reason: 'no JSON object in response' };
    }
    const parsed = JSON.parse(raw.slice(start, end + 1));

    const analysis: ReadingAnalysis = {
      readingTitle: readingKey(reading),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      historicalContext:
        typeof parsed.historicalContext === 'string' ? parsed.historicalContext : '',
      practicalApplication:
        typeof parsed.practicalApplication === 'string' ? parsed.practicalApplication : '',
    };

    // A response that parsed but carries no summary is not worth storing as
    // "done" -- treat it as a failure so a later run can try again.
    if (!isReadingAnalyzed(analysis)) {
      return { analysis: null, reason: 'response contained no summary' };
    }

    return { analysis };
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[analyze] ${readingKey(reading)} failed: ${reason}`);
    return { analysis: null, reason };
  }
}

/** Generate the unifying reflection. Never throws; returns null on failure. */
export async function generateOverallMessage(
  dayTitle: string,
  analyses: ReadingAnalysis[],
  gate: CallGate
): Promise<{ message: string | null; reason?: string }> {
  const usable = analyses.filter(isReadingAnalyzed);
  if (usable.length === 0) {
    return { message: null, reason: 'no analyzed readings to summarize' };
  }

  if (!(await gate())) {
    return { message: null, reason: 'budget exhausted' };
  }

  const readingSummaries = usable.map((a) => `${a.readingTitle}:\n${a.summary}`).join('\n\n');

  const prompt = `You are a Catholic theologian writing a brief daily reflection. Based on today's Mass readings for "${dayTitle}", write a unified reflection (3–4 sentences) that ties together the central spiritual theme God is communicating through all today's readings.

Reading summaries:
${readingSummaries}

Write a warm, insightful reflection to help a Catholic center their heart for the day. Respond with only the reflection text — no headings, no JSON, no quotation marks.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      return { message: null, reason: 'unexpected response type' };
    }
    const text = block.text.trim();
    return text ? { message: text } : { message: null, reason: 'empty reflection' };
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[analyze] overall message failed: ${reason}`);
    return { message: null, reason };
  }
}
