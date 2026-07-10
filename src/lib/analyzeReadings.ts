import Anthropic from '@anthropic-ai/sdk';
import { DayReadings, DayAnalysis, ReadingAnalysis } from '@/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeReadings(dayReadings: DayReadings): Promise<DayAnalysis> {
  const { readings, liturgicalTitle } = dayReadings;

  const readingBlocks = readings
    .map(
      (r, i) => `[Reading ${i + 1}] ${r.title} — ${r.reference}

${r.text}`
    )
    .join('\n\n---\n\n');

  const prompt = `You are a knowledgeable Catholic theologian and spiritual director helping everyday Catholics understand the Mass readings. Your tone is warm, clear, and faithful to Catholic teaching.

Today's liturgical day: ${liturgicalTitle}

Below are today's ${readings.length} Mass reading(s), each labeled [Reading N]:

${readingBlocks}

Analyze every reading, then write one unified reflection that ties them together. Respond ONLY with a valid JSON object in this exact shape:
{
  "readings": [
    {
      "summary": "2–3 sentences in plain modern English explaining what this passage is saying, as if speaking to someone unfamiliar with Biblical language.",
      "keyTakeaways": [
        "First key message or truth the Lord is communicating.",
        "Second key message or truth.",
        "Third key message or truth."
      ],
      "historicalContext": "2–3 sentences about the historical, cultural, or theological background that helps the reader understand the passage more deeply.",
      "practicalApplication": "2–3 sentences on how a Catholic today can concretely apply this reading's message to their daily life."
    }
  ],
  "overallMessage": "A warm, insightful reflection (3–4 sentences) tying together the central spiritual theme God is communicating through all today's readings, to help a Catholic center their heart for the day. No headings, no quotation marks."
}

The "readings" array must contain exactly one object per reading, in the same order as the readings appear above ([Reading 1] first, [Reading 2] second, and so on).`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Anthropic response type');

  // Extract the JSON object regardless of surrounding prose or code fences
  const raw = block.text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in Anthropic response');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const parsedReadings: unknown[] = Array.isArray(parsed.readings) ? parsed.readings : [];

  const analyses: ReadingAnalysis[] = readings.map((reading, i) => {
    const a = (parsedReadings[i] ?? {}) as Record<string, unknown>;
    return {
      readingTitle: `${reading.title} — ${reading.reference}`,
      summary: typeof a.summary === 'string' ? a.summary : '',
      keyTakeaways: Array.isArray(a.keyTakeaways) ? (a.keyTakeaways as string[]) : [],
      historicalContext: typeof a.historicalContext === 'string' ? a.historicalContext : '',
      practicalApplication:
        typeof a.practicalApplication === 'string' ? a.practicalApplication : '',
    };
  });

  return {
    readings: analyses,
    overallMessage: typeof parsed.overallMessage === 'string' ? parsed.overallMessage.trim() : '',
    analyzedAt: new Date().toISOString(),
  };
}
