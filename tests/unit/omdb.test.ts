import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseImdbRating, fetchImdbRating, type OmdbResponse } from '../../lib/external/omdb';

describe('parseImdbRating', () => {
  it('parses a valid rating', () => {
    const raw: OmdbResponse = { Response: 'True', imdbRating: '8.8' };
    expect(parseImdbRating(raw)).toBe(8.8);
  });

  it('returns null when OMDb reports no result', () => {
    const raw: OmdbResponse = { Response: 'False', imdbRating: 'N/A' };
    expect(parseImdbRating(raw)).toBeNull();
  });

  it('returns null when the rating is "N/A"', () => {
    const raw: OmdbResponse = { Response: 'True', imdbRating: 'N/A' };
    expect(parseImdbRating(raw)).toBeNull();
  });
});

describe('fetchImdbRating', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and parses the rating for an IMDb id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Response: 'True', imdbRating: '8.8' }),
      }),
    );

    const rating = await fetchImdbRating('tt1375666', 'test-key');

    expect(rating).toBe(8.8);
  });

  it('returns null when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    expect(await fetchImdbRating('tt1375666', 'test-key')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await fetchImdbRating('tt1375666', 'test-key')).toBeNull();
  });
});
