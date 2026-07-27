import { notFound } from 'next/navigation';
import { getMovieById, getShowtimesForMovie } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import styles from './page.module.css';

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);

  // A non-numeric route param (e.g. /movies/abc) yields NaN, which Postgres
  // rejects as an integer parameter — 404 instead of an unhandled 500.
  if (!Number.isInteger(numericId)) {
    notFound();
  }

  const movie = await getMovieById(numericId);

  if (!movie) {
    notFound();
  }

  const showtimes = await getShowtimesForMovie(movie.id);
  const posterUrl = movie.posterUrl ?? '/placeholder-poster.svg';

  return (
    <main>
      <div
        className={styles.hero}
        style={{ backgroundImage: `url(${posterUrl})` }}
        role="img"
        aria-label={`${movie.title} poster`}
      >
        <h1 className={styles.heroTitle}>{movie.title}</h1>
      </div>
      <dl className={styles.meta}>
        <div className={styles.metaItem}>
          <dt>Director</dt>
          <dd>{movie.director ?? 'Unknown'}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>Cast</dt>
          <dd>{movie.actors.length > 0 ? movie.actors.join(', ') : 'Unknown'}</dd>
        </div>
        <div className={styles.metaItem}>
          <dt>Runtime</dt>
          <dd>{movie.runtime ? `${movie.runtime} min` : 'Unknown'}</dd>
        </div>
        {movie.imdbRating !== null && (
          <div className={styles.metaItem}>
            <dt>IMDb Rating</dt>
            <dd className={styles.ratingBadge}>{movie.imdbRating.toFixed(1)} / 10</dd>
          </div>
        )}
      </dl>
      <p className={styles.synopsis}>{movie.synopsis}</p>
      {movie.trailerUrl && (
        <p>
          <a
            href={movie.trailerUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.trailerButton}
          >
            Watch trailer
          </a>
        </p>
      )}
      <h2>Showtimes</h2>
      {showtimes.length === 0 ? (
        <p className={styles.empty}>No showtimes scheduled yet.</p>
      ) : (
        <ul className={styles.showtimeList}>
          {showtimes.map((showtime) => (
            <li key={showtime.id} className={styles.showtimeChip}>
              {formatShowtime(showtime.startTime)}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
