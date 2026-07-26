import Link from 'next/link';
import { getAllShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';

export default async function ShowtimesPage() {
  const showtimes = await getAllShowtimes();

  return (
    <main>
      <h1>Showtimes</h1>
      {showtimes.length === 0 ? (
        <p>No showtimes scheduled right now.</p>
      ) : (
        <ul>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>
              <Link href={`/movies/${showtime.movie.id}`}>{showtime.movie.title}</Link>
              {' — '}
              {formatShowtime(showtime.startTime)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
