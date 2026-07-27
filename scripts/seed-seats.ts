import { db as defaultDb } from '../lib/db/client';
import { seats, ticketTypes } from '../lib/db/schema';

type Database = typeof defaultDb;

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const SEATS_PER_SIDE = 5;
// Accessible seats sit on the aisle in the front row, matching the design's
// seat map (row A, seat 5 = last seat of the left block; seat 6 = first seat
// of the right block), plus their back-row counterparts for a second option.
const ACCESSIBLE_SEATS = new Set(['A-5', 'A-6', 'H-5', 'H-6']);

export async function seedSeats(db: Database = defaultDb): Promise<void> {
  const seatRows = ROWS.flatMap((row) =>
    Array.from({ length: SEATS_PER_SIDE * 2 }, (_, i) => {
      const seatNumber = i + 1;
      return {
        row,
        seatNumber,
        isAccessible: ACCESSIBLE_SEATS.has(`${row}-${seatNumber}`),
      };
    }),
  );

  await db.insert(seats).values(seatRows).onConflictDoNothing();

  await db
    .insert(ticketTypes)
    .values([
      { code: 'adult', label: 'Adult', priceCents: 1200 },
      { code: 'child', label: 'Child', priceCents: 800 },
      { code: 'senior', label: 'Senior', priceCents: 1000 },
    ])
    .onConflictDoNothing();
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  seedSeats()
    .then(() => {
      console.log('Seeded seats and ticket types');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
