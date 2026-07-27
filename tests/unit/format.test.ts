import { describe, it, expect } from 'vitest';
import { formatShowtime } from '../../lib/format';

// Intl renders either a regular space (U+0020) or a narrow no-break space
// (U+202F) before AM/PM depending on the Node/ICU version, so compare with all
// whitespace collapsed to a plain space rather than pinning one variant.
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ');

describe('formatShowtime', () => {
  it('formats a UTC instant in the cinema local time zone', () => {
    const date = new Date('2026-08-01T18:00:00Z');
    expect(normalizeWhitespace(formatShowtime(date))).toBe('Sat, Aug 1, 8:00 PM');
  });
});
