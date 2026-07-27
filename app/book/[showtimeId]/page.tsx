import { notFound } from 'next/navigation';
import { getShowtimeById, getMovieById, getTicketTypes } from '@/lib/db/queries';
import { getSeatAvailability } from '@/lib/booking/availability';
import { formatShowtime } from '@/lib/format';
import { SeatMap } from './seat-map';
import { createBookingAction } from './actions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function BookShowtimePage({ params }: { params: Promise<{ showtimeId: string }> }) {
  const { showtimeId } = await params;
  const numericShowtimeId = Number(showtimeId);

  if (!Number.isInteger(numericShowtimeId)) {
    notFound();
  }

  const showtime = await getShowtimeById(numericShowtimeId);
  if (!showtime) {
    notFound();
  }

  const movie = await getMovieById(showtime.movieId);
  if (!movie) {
    notFound();
  }

  const [seats, ticketTypes] = await Promise.all([getSeatAvailability(showtime.id), getTicketTypes()]);

  return (
    <main>
      <h1>Book {movie.title}</h1>
      <p className={styles.summary}>{formatShowtime(showtime.startTime)}</p>
      <SeatMap showtimeId={showtime.id} seats={seats} ticketTypes={ticketTypes} createBookingAction={createBookingAction} />
    </main>
  );
}
