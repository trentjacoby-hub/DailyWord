'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getPreviousDate, getNextDate, isFutureDate, formatDateDisplay } from '@/lib/dates';

interface Props {
  currentDate: string;  // YYYY-MM-DD
  todayDate: string;    // YYYY-MM-DD in CST (passed from server)
  availableDates: string[]; // sorted descending, YYYY-MM-DD
}

export default function CalendarNav({ currentDate, todayDate, availableDates }: Props) {
  const router = useRouter();
  const [showCalendar, setShowCalendar] = useState(false);

  const prevDate = getPreviousDate(currentDate);
  const nextDate = getNextDate(currentDate);
  const prevIsAvailable = availableDates.includes(prevDate);
  const nextIsFuture = isFutureDate(nextDate);

  const navigate = (date: string) => {
    router.push(date === todayDate ? '/' : `/${date}`);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Prev / Date / Next row */}
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

        {/* Current date — click to toggle calendar */}
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '1rem',
            color: 'var(--gold)',
            textAlign: 'center',
            padding: '0.25rem 0.75rem',
            borderRadius: 6,
            borderBottom: '1px dashed var(--border)',
          }}
        >
          {formatDateDisplay(currentDate)}
        </button>

        {/* Next */}
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
      </div>

      {/* Dropdown calendar of available dates */}
      {showCalendar && availableDates.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
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
                onClick={() => {
                  setShowCalendar(false);
                  navigate(d);
                }}
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
