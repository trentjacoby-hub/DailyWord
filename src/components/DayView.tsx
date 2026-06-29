import { DayReadings } from '@/types';
import { formatDateISO, getTodayCST } from '@/lib/dates';
import ReadingCard from './ReadingCard';
import AnalysisCard from './AnalysisCard';
import CalendarNav from './CalendarNav';
import SiteHeader from './SiteHeader';

interface Props {
  dayReadings: DayReadings;
  availableDates: string[];
}

export default function DayView({ dayReadings, availableDates }: Props) {
  const { liturgicalTitle, readings, analysis } = dayReadings;

  return (
    <>
    <SiteHeader
      currentDate={dayReadings.date}
      todayDate={formatDateISO(getTodayCST())}
      availableDates={availableDates}
    />
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Navigation */}
      <CalendarNav
        currentDate={dayReadings.date}
        todayDate={formatDateISO(getTodayCST())}
        availableDates={availableDates}
      />

      {/* Liturgical day title */}
      <div style={{ textAlign: 'center', margin: '2.5rem 0 2rem' }}>
        <div
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.7rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
          }}
        >
          Catholic Mass Readings
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
            fontWeight: 700,
            color: '#e8dcc8',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {liturgicalTitle}
        </h1>
      </div>

      {/* Overall message */}
      {analysis?.overallMessage && (
        <div
          className="fade-in"
          style={{
            background: 'linear-gradient(135deg, #1a1510 0%, #1f1b16 100%)',
            border: '1px solid #3a2e1e',
            borderRadius: 12,
            padding: '1.75rem 2rem',
            marginBottom: '2.5rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '0.65rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#c9a55a',
              marginBottom: '1rem',
              opacity: 0.8,
            }}
          >
            ✦ &nbsp; Today's Message &nbsp; ✦
          </div>
          <p
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontStyle: 'normal',
              fontSize: 'clamp(0.95rem, 2vw, 1.05rem)',
              lineHeight: 1.9,
              color: '#e8dcc8',
              margin: 0,
              maxWidth: 680,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {analysis.overallMessage}
          </p>
        </div>
      )}

      {/* Readings + analyses interleaved */}
      {readings.map((reading, i) => {
        const readingAnalysis = analysis?.readings.find((a) =>
          a.readingTitle.startsWith(reading.title)
        );

        return (
          <section key={i}>
            <ReadingCard reading={reading} index={i} />
            {readingAnalysis && (
              <AnalysisCard analysis={readingAnalysis} index={i} />
            )}
          </section>
        );
      })}

      {/* No analysis fallback */}
      {!analysis && (
        <div
          style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '0.875rem',
            marginTop: '2rem',
          }}
        >
          Analysis is being generated — refresh in a moment.
        </div>
      )}
    </div>
    </>
  );
}
