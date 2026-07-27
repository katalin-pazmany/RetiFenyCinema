import Link from 'next/link';
import { getNowShowing } from '@/lib/db/queries';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const movies = await getNowShowing();

  return (
    <main>
      <h1>Now Showing at RetfenyMozi</h1>
      {movies.length === 0 ? (
        <p>No movies are scheduled right now — check back soon.</p>
      ) : (
        <ul>
          {movies.map((movie) => (
            <li key={movie.id}>
              <Link href={`/movies/${movie.id}`}>
                {movie.posterUrl ? (
                  <img src={movie.posterUrl} alt={`${movie.title} poster`} width={92} />
                ) : (
                  <img src="/placeholder-poster.svg" alt={`${movie.title} poster placeholder`} width={92} />
                )}
                <h2>{movie.title}</h2>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
