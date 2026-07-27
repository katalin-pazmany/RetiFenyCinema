import type { SeatSelection, TicketType } from '../types';

export function calculateTotalCents(selections: SeatSelection[], ticketTypes: TicketType[]): number {
  const priceByTicketTypeId = new Map(ticketTypes.map((t) => [t.id, t.priceCents]));

  return selections.reduce((total, selection) => {
    const price = priceByTicketTypeId.get(selection.ticketTypeId);
    if (price === undefined) {
      throw new Error(`Unknown ticket type id: ${selection.ticketTypeId}`);
    }
    return total + price;
  }, 0);
}
