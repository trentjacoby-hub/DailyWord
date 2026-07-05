import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Today's Teachings — Catholic Readings, Reflection, & Analysis",
  description: "Today's Teachings: daily Catholic Mass readings with AI-powered reflections following the liturgical calendar.",
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: 'calc(100vh - 80px)' }}>{children}</main>

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
            href="https://www.catholicgallery.org"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--gold)', textDecoration: 'none' }}
          >
            Catholic Gallery
          </a>
          . AI reflections are aids to contemplation, not official Catholic teaching.
        </footer>
      </body>
    </html>
  );
}
