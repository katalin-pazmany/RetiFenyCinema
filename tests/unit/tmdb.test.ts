import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapTmdbToMovie, fetchTmdbMovie, type TmdbMovieResponse } from '../../lib/external/tmdb';

const fixture: TmdbMovieResponse = {
  id: 27205,
  title: 'Inception',
  overview: 'A thief who steals corporate secrets through dream-sharing technology.',
  poster_path: '/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
  runtime: 148,
  credits: {
    cast: [
      { name: 'Tom Hardy', order: 3 },
      { name: 'Leonardo DiCaprio', order: 0 },
      { name: 'Ken Watanabe', order: 4 },
      { name: 'Joseph Gordon-Levitt', order: 1 },
      { name: 'Cillian Murphy', order: 5 },
      { name: 'Elliot Page', order: 2 },
    ],
    crew: [
      { name: 'Christopher Nolan', job: 'Director' },
      { name: 'Emma Thomas', job: 'Producer' },
    ],
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Teaser', key: 'teaser-key' },
      { site: 'YouTube', type: 'Trailer', key: 'trailer-key' },
    ],
  },
  external_ids: { imdb_id: 'tt1375666' },
};

describe('mapTmdbToMovie', () => {
  it('maps a TMDB response to MovieMetadata', () => {
    expect(mapTmdbToMovie(fixture)).toEqual({
      tmdbId: 27205,
      imdbId: 'tt1375666',
      title: 'Inception',
      synopsis: 'A thief who steals corporate secrets through dream-sharing technology.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
      runtime: 148,
      director: 'Christopher Nolan',
      actors: [
        'Leonardo DiCaprio',
        'Joseph Gordon-Levitt',
        'Elliot Page',
        'Tom Hardy',
        'Ken Watanabe',
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=trailer-key',
    });
  });

  it('handles missing poster, director, and trailer', () => {
    const sparse: TmdbMovieResponse = {
      id: 1,
      title: 'Untitled',
      overview: 'No synopsis yet.',
      poster_path: null,
      runtime: null,
      credits: { cast: [], crew: [] },
      videos: { results: [] },
      external_ids: { imdb_id: null },
    };
    const result = mapTmdbToMovie(sparse);
    expect(result.posterUrl).toBeNull();
    expect(result.director).toBeNull();
    expect(result.trailerUrl).toBeNull();
    expect(result.actors).toEqual([]);
  });
});

describe('fetchTmdbMovie', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and maps a movie by TMDB id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fixture),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchTmdbMovie(27205, 'test-key');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.themoviedb.org/3/movie/27205?api_key=test-key&append_to_response=credits,videos,external_ids',
    );
    expect(result.title).toBe('Inception');
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchTmdbMovie(999, 'test-key')).rejects.toThrow('TMDB request failed with status 404');
  });
});
