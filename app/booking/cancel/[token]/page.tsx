import { notFound } from 'next/navigation';
import { getBookingByCancellationToken, getShowtimeById, getMovieById } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import { cancelBookingAction } from './actions';
import { CancelButton } from './cancel-button';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function CancelBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByCancellationToken(token);

  if (!booking) {
    notFound();
  }

  const showtime = await getShowtimeById(booking.showtimeId);
  const movie = showtime ? await getMovieById(showtime.movieId) : null;

  if (booking.status === 'cancelled') {
    return (
      <main>
        <h1>Booking already cancelled</h1>
        <p className={styles.details}>This booking has already been cancelled.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Cancel your booking</h1>
      {movie && showtime && (
        <p className={styles.details}>
          {movie.title} — {formatShowtime(showtime.startTime)}
        </p>
      )}
      <CancelButton token={token} cancelBookingAction={cancelBookingAction} />
    </main>
  );
}
