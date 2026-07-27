// A pinned poster-scroll scene with only one poster in it would look broken
// rather than cinematic — there's nothing to slide. Below this threshold,
// the homepage renders the poster(s) centered and static instead.
export const MIN_MOVIES_FOR_SCROLL_SCENE = 2;

export function usesScrollScene(movieCount: number): boolean {
  return movieCount >= MIN_MOVIES_FOR_SCROLL_SCENE;
}
