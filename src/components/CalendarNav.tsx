'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { getPreviousDate, getNextDate, isFutureDate, formatDateDisplay } from '@/lib/dates';

interface Props {
  currentDate: string;
  todayDate: string;
  availableDates: string[];
}

export default function CalendarNav({ currentDate, todayDate, availableDates }: Props) {
  const router = useRouter();
  const [showCalendar, setShowCalendar] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const prevDate = getPreviousDate(currentDate);
  const nextDate = getNextDate(currentDate);
  const prevIsAvailable = availableDates.includes(prevDate);
  const nextIsFuture = isFutureDate(nextDate);

  const navigate = (date: string) => {
    setShowCalendar(false);
    router.push(date === todayDate ? '/' : `/${date}`);
  };

  // Close dropdown when clicking outside
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
    <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '0.5rem',
        }}
      >
        {/* Prev */}
        <button
          onClick={() => prevIsAvailable && navigate(prevDate)}
          disabled={!prevIsAvailable}
          title={prevIsAvailable ? 'Previous day' : 'No earlier readings'}
          style={{
            ...navBtnStyle,
            opacity: prevIsAvailable ? 1 : 0.3,
            cursor: prevIsAvailable ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => {
            if (prevIsAvailable) (e.target as HTMLElement).style.color = '#c9a55a';
          }}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-muted)')}
        >
          ← Previous
        </button>

        {/* Current date — display only */}
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '1rem',
            color: 'var(--gold)',
            textAlign: 'center',
          }}
        >
          {formatDateDisplay(currentDate)}
        </span>

        {/* Next + Calendar icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => !nextIsFuture && navigate(nextDate)}
            disabled={nextIsFuture}
            title={nextIsFuture ? 'Future date' : 'Next day'}
            style={{
              ...navBtnStyle,
              opacity: nextIsFuture ? 0.3 : 1,
              cursor: nextIsFuture ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!nextIsFuture) (e.target as HTMLElement).style.color = '#c9a55a';
            }}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-muted)')}
          >
            Next →
          </button>

          {/* Calendar icon */}
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            title="Browse past readings"
            style={{
              background: showCalendar ? 'var(--surface-2)' : 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              padding: '0.3rem 0.4rem',
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
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="3" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 6.5h13" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5 1.5V4M10 1.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <rect x="3.5" y="8.5" width="2" height="2" rx="0.5" fill="currentColor"/>
              <rect x="6.5" y="8.5" width="2" height="2" rx="0.5" fill="currentColor"/>
              <rect x="9.5" y="8.5" width="2" height="2" rx="0.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown — anchored to top right */}
      {showCalendar && availableDates.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 50,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '1rem',
            minWidth: 260,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            marginTop: '0.25rem',
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
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '0.875rem',
  color: 'var(--text-muted)',
  padding: '0.25rem 0.5rem',
  transition: 'color 0.15s',
};
