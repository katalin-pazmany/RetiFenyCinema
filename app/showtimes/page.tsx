import Link from 'next/link';
import { getAllShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import styles from './page.module.css';

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
        <p className={styles.empty}>No showtimes scheduled right now.</p>
      ) : (
        <ul className={styles.list}>
          {showtimes.map((showtime) => (
            <li key={showtime.id} className={styles.row}>
              <Link href={`/movies/${showtime.movie.id}`} className={styles.movieLink}>
                {showtime.movie.title}
              </Link>
              <Link href={`/book/${showtime.id}`} className={styles.bookLink}>
                Book — {formatShowtime(showtime.startTime)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
