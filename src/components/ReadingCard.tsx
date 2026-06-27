import { Reading } from '@/types';

interface Props {
  reading: Reading;
  index: number;
}

const TITLE_COLORS: Record<string, string> = {
  'Reading 1': '#c9a55a',
  'Reading 2': '#c9a55a',
  'Responsorial Psalm': '#9b7fd4',
  Gospel: '#7aad8a',
  Alleluia: '#7aad8a',
};

export default function ReadingCard({ reading, index }: Props) {
  const titleColor =
    Object.entries(TITLE_COLORS).find(([key]) => reading.title.startsWith(key))?.[1] ??
    '#c9a55a';

  return (
    <div
      className="fade-in"
      style={{
        animationDelay: `${index * 0.1}s`,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '2rem',
        marginBottom: '0.5rem',
      }}
    >
      {/* Reading type label */}
      <div
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: titleColor,
          marginBottom: '0.375rem',
        }}
      >
        {reading.title}
      </div>

      {/* Scripture reference */}
      <div
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '1.1rem',
          fontStyle: 'italic',
          color: 'var(--text-muted)',
          marginBottom: '1.5rem',
        }}
      >
        {reading.reference}
      </div>

      {/* Ornamental divider */}
      <div className="ornament" style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.6rem' }}>✦</span>
      </div>

      {/* Scripture text */}
      <div
        className="scripture-text"
        style={{
          fontFamily: "'Crimson Text', Georgia, serif",
          fontSize: '1.05rem',
          lineHeight: 1.9,
          color: 'var(--text)',
        }}
      >
        {reading.text.split('\n\n').map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </div>
  );
}
