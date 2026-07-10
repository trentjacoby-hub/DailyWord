'use client';

import { useRouter } from 'next/navigation';
import { getPreviousDate, getNextDate, isFutureDate, formatDateDisplay } from '@/lib/dates';

interface Props {
  currentDate: string;
  todayDate: string;
  availableDates: string[];
}

export default function CalendarNav({ currentDate, todayDate, availableDates }: Props) {
  const router = useRouter();

  const prevDate = getPreviousDate(currentDate);
  const nextDate = getNextDate(currentDate);
  const prevIsAvailable = availableDates.includes(prevDate);
  const nextIsFuture = isFutureDate(nextDate);

  const navigate = (date: string) => {
    router.push(date === todayDate ? '/' : `/${date}`);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
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
          justifySelf: 'start',
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

      {/* Current date */}
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

      {/* Next */}
      <button
        onClick={() => !nextIsFuture && navigate(nextDate)}
        disabled={nextIsFuture}
        title={nextIsFuture ? 'Generates Tomorrow At Midnight' : 'Next day'}
        style={{
          ...navBtnStyle,
          justifySelf: 'end',
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
