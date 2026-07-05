import { ReadingAnalysis } from '@/types';

interface Props {
  analysis: ReadingAnalysis;
  index: number;
}

export default function AnalysisCard({ analysis, index }: Props) {
  return (
    <div
      className="fade-in"
      style={{
        animationDelay: `${index * 0.1 + 0.15}s`,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--gold)',
        borderRadius: '0 12px 12px 0',
        padding: '1.75rem 2rem',
        marginBottom: '2.5rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="#c9a55a" strokeWidth="1.5" />
          <path d="M5 7h4M7 5v4" stroke="#c9a55a" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Reflection &amp; Analysis
      </div>

      {/* Summary */}
      <Section title="In Plain Words">
        <p style={{ marginBottom: 0 }}>{analysis.summary}</p>
      </Section>

      {/* Key Takeaways */}
      <Section title="Key Takeaways">
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          {analysis.keyTakeaways.map((t, i) => (
            <li key={i} style={{ marginBottom: '0.4rem' }}>
              {t}
            </li>
          ))}
        </ul>
      </Section>

      {/* Historical Context */}
      <Section title="Historical & Cultural Context">
        <p style={{ marginBottom: 0 }}>{analysis.historicalContext}</p>
      </Section>

      {/* Practical Application */}
      <Section title="Living It Today">
        <p style={{ marginBottom: 0 }}>{analysis.practicalApplication}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <h3
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--gold-light, #e8c87a)',
          marginBottom: '0.4rem',
          letterSpacing: '0.02em',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          fontFamily: "'Crimson Text', Georgia, serif",
          fontSize: '1rem',
          lineHeight: 1.8,
          color: 'var(--text)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

