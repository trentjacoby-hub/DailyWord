'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { formatDateDisplay } from '@/lib/dates';

interface Props {
  currentDate: string;
  todayDate: string;
  availableDates: string[];
}

export default function SiteHeader({ currentDate, todayDate, availableDates }: Props) {
  const router = useRouter();
  const [showCalendar, setShowCalendar] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navigate = (date: string) => {
    setShowCalendar(false);
    router.push(date === todayDate ? '/' : `/${date}`);
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    }
    if (showCalendar) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        position: 'relative',
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
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
          </a>
        </div>

        {/* Calendar icon */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            title="Browse past readings"
            style={{
              background: showCalendar ? 'var(--surface-2)' : 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              padding: '0.35rem 0.45rem',
              color: showCalendar ? 'var(--gold)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = '#c9a55a';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = showCalendar ? 'var(--gold)' : 'var(--text-muted)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="3" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 6.5h13" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 1.5V4M10 1.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <rect x="3.5" y="8.5" width="2" height="2" rx="0.5" fill="currentColor"/>
              <rect x="6.5" y="8.5" width="2" height="2" rx="0.5" fill="currentColor"/>
              <rect x="9.5" y="8.5" width="2" height="2" rx="0.5" fill="currentColor"/>
            </svg>
          </button>

          {showCalendar && availableDates.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                right: 0,
                zIndex: 200,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '1rem',
                minWidth: 260,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: '0.75rem',
                }}
              >
                Past Readings
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {availableDates.map((d) => (
                  <button
                    key={d}
                    onClick={() => navigate(d)}
                    style={{
                      background: d === currentDate ? 'var(--surface-2)' : 'none',
                      border: 'none',
                      borderRadius: 6,
                      padding: '0.4rem 0.75rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: "'Crimson Text', Georgia, serif",
                      fontSize: '1rem',
                      color: d === currentDate ? 'var(--gold)' : 'var(--text)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (d !== currentDate)
                        (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      if (d !== currentDate)
                        (e.currentTarget as HTMLElement).style.background = 'none';
                    }}
                  >
                    {formatDateDisplay(d)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
