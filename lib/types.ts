export interface MovieMetadata {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  synopsis: string;
  posterUrl: string | null;
  runtime: number | null;
  director: string | null;
  actors: string[];
  trailerUrl: string | null;
}

export interface Movie extends MovieMetadata {
  id: number;
  imdbRating: number | null;
}

export interface Showtime {
  id: number;
  movieId: number;
  startTime: Date;
}
