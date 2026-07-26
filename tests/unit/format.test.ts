import { describe, it, expect } from 'vitest';
import { formatShowtime } from '../../lib/format';

describe('formatShowtime', () => {
  it('formats a UTC instant in the cinema local time zone', () => {
    const date = new Date('2026-08-01T18:00:00Z');
    expect(formatShowtime(date)).toBe('Sat, Aug 1, 8:00 PM');
  });
});
