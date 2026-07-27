import Link from 'next/link';
import { getAllShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

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
