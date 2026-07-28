import Link from 'next/link';
import { getNowShowingWithShowtimes } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import styles from './page.module.css';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const movies = await getNowShowingWithShowtimes();

  return (
    <main>
      <h1>Now Showing at RetfenyMozi</h1>
      {movies.length === 0 ? (
        <p className={styles.empty}>No movies are scheduled right now — check back soon.</p>
      ) : (
        <ul className={styles.list}>
          {movies.map((movie) => (
            <li key={movie.id} className={styles.card}>
              {movie.posterUrl ? (
                <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.poster} />
              ) : (
                <img
                  src="/placeholder-poster.svg"
                  alt={`${movie.title} poster placeholder`}
                  className={styles.poster}
                />
              )}
              <div className={styles.details}>
                <h2 className={styles.title}>
                  <Link href={`/movies/${movie.id}`}>{movie.title}</Link>
                </h2>
                {movie.imdbRating !== null && (
                  <span className={styles.ratingBadge}>{movie.imdbRating.toFixed(1)} / 10</span>
                )}
                <p className={styles.synopsis}>{movie.synopsis}</p>
                {movie.showtimes.length > 0 && (
                  <ul className={styles.showtimeList}>
                    {movie.showtimes.map((showtime) => (
                      <li key={showtime.id}>
                        <Link href={`/book/${showtime.id}`} className={styles.bookButton}>
                          Book — {formatShowtime(showtime.startTime)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
