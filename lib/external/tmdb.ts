import type { MovieMetadata } from '../types';

export interface TmdbMovieResponse {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  runtime: number | null;
  credits: {
    cast: Array<{ name: string; order: number }>;
    crew: Array<{ name: string; job: string }>;
  };
  videos: {
    results: Array<{ site: string; type: string; key: string }>;
  };
  external_ids: {
    imdb_id: string | null;
  };
}

export function mapTmdbToMovie(raw: TmdbMovieResponse): MovieMetadata {
  const director = raw.credits.crew.find((c) => c.job === 'Director')?.name ?? null;
  const actors = [...raw.credits.cast].sort((a, b) => a.order - b.order).slice(0, 5).map((c) => c.name);
  const trailer = raw.videos.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer');

  return {
    tmdbId: raw.id,
    imdbId: raw.external_ids.imdb_id,
    title: raw.title,
    synopsis: raw.overview,
    posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : null,
    runtime: raw.runtime,
    director,
    actors,
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
  };
}

export async function fetchTmdbMovie(tmdbId: number, apiKey: string): Promise<MovieMetadata> {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits,videos,external_ids`,
  );
  if (!res.ok) {
    throw new Error(`TMDB request failed with status ${res.status}`);
  }
  const raw = (await res.json()) as TmdbMovieResponse;
  return mapTmdbToMovie(raw);
}
