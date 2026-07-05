import type { Metadata } from 'next';
import './globals.css';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Catholic Readings, Reflection, & Analysis`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'Catholic Mass readings',
    'daily Mass readings',
    'liturgical calendar',
    'Gospel reflection',
    'Catholic devotional',
    'Scripture reflection',
    'daily readings',
  ],
  icons: { icon: '/favicon.ico' },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Catholic Readings, Reflection, & Analysis`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Catholic Readings, Reflection, & Analysis`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
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
