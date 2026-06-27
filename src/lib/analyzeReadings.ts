import Anthropic from '@anthropic-ai/sdk';
import { DayReadings, DayAnalysis, ReadingAnalysis } from '@/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Alleluia verse is too short to analyze meaningfully
const SKIP_TITLES = ['Alleluia'];

export async function analyzeReadings(dayReadings: DayReadings): Promise<DayAnalysis> {
  const readingsToAnalyze = dayReadings.readings.filter(
    (r) => !SKIP_TITLES.some((s) => r.title.startsWith(s))
  );

  const analyses = await Promise.all(
    readingsToAnalyze.map((reading) =>
      analyzeOneReading(reading.title, reading.reference, reading.text, dayReadings.liturgicalTitle)
    )
  );

  const overallMessage = await generateOverallMessage(dayReadings.liturgicalTitle, analyses);

  return {
    readings: analyses,
    overallMessage,
    analyzedAt: new Date().toISOString(),
  };
}

async function analyzeOneReading(
  title: string,
  reference: string,
  text: string,
  dayTitle: string
): Promise<ReadingAnalysis> {
  const prompt = `You are a knowledgeable Catholic theologian and spiritual director helping everyday Catholics understand the Mass readings. Your tone is warm, clear, and faithful to Catholic teaching.

Today's liturgical day: ${dayTitle}
Reading: ${title} — ${reference}

Scripture text:
${text}

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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
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

  return {
    readingTitle: `${title} — ${reference}`,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
    historicalContext: typeof parsed.historicalContext === 'string' ? parsed.historicalContext : '',
    practicalApplication: typeof parsed.practicalApplication === 'string' ? parsed.practicalApplication : '',
  };
}

async function generateOverallMessage(
  dayTitle: string,
  analyses: ReadingAnalysis[]
): Promise<string> {
  const readingSummaries = analyses
    .map((a) => `${a.readingTitle}:\n${a.summary}`)
    .join('\n\n');

  const prompt = `You are a Catholic theologian writing a brief daily reflection. Based on today's Mass readings for "${dayTitle}", write a unified reflection (3–4 sentences) that ties together the central spiritual theme God is communicating through all today's readings.

Reading summaries:
${readingSummaries}

Write a warm, insightful reflection to help a Catholic center their heart for the day. Respond with only the reflection text — no headings, no JSON, no quotation marks.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Anthropic response type');
  return block.text.trim();
}
