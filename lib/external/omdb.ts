export interface OmdbResponse {
  Response: string;
  imdbRating: string;
}

export function parseImdbRating(raw: OmdbResponse): number | null {
  if (raw.Response !== 'True') return null;
  const parsed = Number.parseFloat(raw.imdbRating);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function fetchImdbRating(imdbId: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}`);
    if (!res.ok) return null;
    const raw = (await res.json()) as OmdbResponse;
    return parseImdbRating(raw);
  } catch {
    return null;
  }
}
