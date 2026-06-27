import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Daily Word — Catholic Mass Readings',
  description: 'Daily Catholic Mass readings with AI-powered reflections following the liturgical calendar.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              maxWidth: 900,
              margin: '0 auto',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.875rem',
            }}
          >
            {/* Cross icon */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="11" y="2" width="6" height="24" rx="1" fill="#c9a55a" />
              <rect x="2" y="10" width="24" height="6" rx="1" fill="#c9a55a" />
            </svg>
            <a href="/" style={{ textDecoration: 'none' }}>
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '1.4rem',
                  fontWeight: 600,
                  color: '#c9a55a',
                  letterSpacing: '0.02em',
                }}
              >
                Daily Word
              </span>
              <span
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  marginLeft: '0.5rem',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                Catholic Mass Readings
              </span>
            </a>
          </div>
        </header>

        <main style={{ minHeight: 'calc(100vh - 140px)' }}>{children}</main>

        <footer
          style={{
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
            padding: '1.5rem',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Readings sourced from the{' '}
          <a
            href="https://bible.usccb.org"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--gold)', textDecoration: 'none' }}
          >
            USCCB
          </a>
          . AI reflections are aids to contemplation, not official Catholic teaching.
        </footer>
      </body>
    </html>
  );
}
