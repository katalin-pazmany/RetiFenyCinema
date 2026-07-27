import { describe, it, expect } from 'vitest';
import { interpolateCamera, type CameraPose } from '../../lib/homepage/sketchfab-camera';

const from: CameraPose = { eye: [0, 2, 10], target: [0, 1, 0] };
const to: CameraPose = { eye: [0, 6, -4], target: [0, 3, -10] };

describe('interpolateCamera', () => {
  it('returns the start pose at progress 0', () => {
    expect(interpolateCamera(0, from, to)).toEqual(from);
  });

  it('returns the end pose at progress 1', () => {
    expect(interpolateCamera(1, from, to)).toEqual(to);
  });

  it('returns the midpoint at progress 0.5', () => {
    expect(interpolateCamera(0.5, from, to)).toEqual({
      eye: [0, 4, 3],
      target: [0, 2, -5],
    });
  });

  it('clamps progress below 0', () => {
    expect(interpolateCamera(-2, from, to)).toEqual(from);
  });

  it('clamps progress above 1', () => {
    expect(interpolateCamera(5, from, to)).toEqual(to);
  });
});
