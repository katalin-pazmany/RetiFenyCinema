import { fetchTmdbMovie } from '../lib/external/tmdb';
import { fetchImdbRating } from '../lib/external/omdb';
import { db as defaultDb } from '../lib/db/client';
import { movies, showtimes } from '../lib/db/schema';

type Database = typeof defaultDb;

export async function seedMovie(
  tmdbId: number,
  showtimeIsoStrings: string[],
  db: Database = defaultDb,
  tmdbApiKey: string = process.env.TMDB_API_KEY!,
  omdbApiKey: string = process.env.OMDB_API_KEY!,
): Promise<void> {
  const metadata = await fetchTmdbMovie(tmdbId, tmdbApiKey);
  const imdbRating = metadata.imdbId ? await fetchImdbRating(metadata.imdbId, omdbApiKey) : null;

  const values = {
    tmdbId: metadata.tmdbId,
    imdbId: metadata.imdbId,
    title: metadata.title,
    synopsis: metadata.synopsis,
    posterUrl: metadata.posterUrl,
    runtime: metadata.runtime,
    director: metadata.director,
    actors: metadata.actors,
    imdbRating: imdbRating !== null ? imdbRating.toFixed(1) : null,
    trailerUrl: metadata.trailerUrl,
  };

  const [movie] = await db
    .insert(movies)
    .values(values)
    .onConflictDoUpdate({ target: movies.tmdbId, set: values })
    .returning();

  if (showtimeIsoStrings.length > 0) {
    await db.insert(showtimes).values(showtimeIsoStrings.map((iso) => ({ movieId: movie.id, startTime: new Date(iso) })));
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const [tmdbIdArg, ...showtimeArgs] = process.argv.slice(2);
  if (!tmdbIdArg) {
    console.error('Usage: npx tsx scripts/seed-movie.ts <tmdbId> [showtimeIso...]');
    process.exit(1);
  }
  seedMovie(Number(tmdbIdArg), showtimeArgs)
    .then(() => {
      console.log('Seeded movie', tmdbIdArg);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
