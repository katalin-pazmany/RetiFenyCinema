import { notFound } from 'next/navigation';
import { getMovieById, getShowtimesForMovie } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';

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

  return (
    <main>
      <img
        src={movie.posterUrl ?? '/placeholder-poster.svg'}
        alt={`${movie.title} poster`}
        width={200}
      />
      <h1>{movie.title}</h1>
      <p>{movie.synopsis}</p>
      <dl>
        <dt>Director</dt>
        <dd>{movie.director ?? 'Unknown'}</dd>
        <dt>Cast</dt>
        <dd>{movie.actors.length > 0 ? movie.actors.join(', ') : 'Unknown'}</dd>
        <dt>Runtime</dt>
        <dd>{movie.runtime ? `${movie.runtime} min` : 'Unknown'}</dd>
        {movie.imdbRating !== null && (
          <>
            <dt>IMDb Rating</dt>
            <dd>{movie.imdbRating.toFixed(1)} / 10</dd>
          </>
        )}
      </dl>
      {movie.trailerUrl && (
        <p>
          <a href={movie.trailerUrl} target="_blank" rel="noreferrer">
            Watch trailer
          </a>
        </p>
      )}
      <h2>Showtimes</h2>
      {showtimes.length === 0 ? (
        <p>No showtimes scheduled yet.</p>
      ) : (
        <ul>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>{formatShowtime(showtime.startTime)}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
