import { describe, it, expect } from 'vitest';
import { calculateTotalCents } from '../../lib/booking/pricing';
import type { TicketType } from '../../lib/types';

const ticketTypes: TicketType[] = [
  { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 },
  { id: 2, code: 'child', label: 'Child', priceCents: 800 },
  { id: 3, code: 'senior', label: 'Senior', priceCents: 1000 },
];

describe('calculateTotalCents', () => {
  it('sums the price of each selected seat by its ticket type', () => {
    const total = calculateTotalCents(
      [
        { seatId: 1, ticketTypeId: 1 },
        { seatId: 2, ticketTypeId: 1 },
        { seatId: 3, ticketTypeId: 2 },
      ],
      ticketTypes,
    );

    expect(total).toBe(1200 + 1200 + 800);
  });

  it('returns 0 for an empty selection', () => {
    expect(calculateTotalCents([], ticketTypes)).toBe(0);
  });

  it('throws for an unknown ticket type id', () => {
    expect(() => calculateTotalCents([{ seatId: 1, ticketTypeId: 999 }], ticketTypes)).toThrow(
      'Unknown ticket type id: 999',
    );
  });
});
