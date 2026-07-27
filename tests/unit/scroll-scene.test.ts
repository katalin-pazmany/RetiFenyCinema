import { describe, it, expect } from 'vitest';
import { usesScrollScene, MIN_MOVIES_FOR_SCROLL_SCENE } from '../../lib/homepage/scroll-scene';

describe('usesScrollScene', () => {
  it('is false for zero movies', () => {
    expect(usesScrollScene(0)).toBe(false);
  });

  it('is false for exactly one movie', () => {
    expect(usesScrollScene(1)).toBe(false);
  });

  it('is true at the minimum threshold', () => {
    expect(usesScrollScene(MIN_MOVIES_FOR_SCROLL_SCENE)).toBe(true);
  });

  it('is true for many movies', () => {
    expect(usesScrollScene(10)).toBe(true);
  });
});
