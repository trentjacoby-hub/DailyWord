export interface Reading {
  title: string;       // "Reading 1", "Responsorial Psalm", "Gospel", etc.
  reference: string;   // "Matthew 8:5-17"
  text: string;        // Full text of the reading
}

export interface ReadingAnalysis {
  readingTitle: string;
  summary: string;
  keyTakeaways: string[];
  historicalContext: string;
  practicalApplication: string;
}

export interface DayAnalysis {
  readings: ReadingAnalysis[];
  overallMessage: string;
  analyzedAt: string;
}

export interface DayReadings {
  date: string;           // YYYY-MM-DD
  liturgicalTitle: string; // "Saturday of the Twelfth Week in Ordinary Time"
  readings: Reading[];
  analysis?: DayAnalysis;
  fetchedAt?: string;
}
