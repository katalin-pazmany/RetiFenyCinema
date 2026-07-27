# RetfenyMozi Booking System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest customer pick a showtime, select specific seats on an 80-seat map, choose Adult/Child/Senior tickets, pay via Stripe Checkout, and receive a Resend confirmation email with a working cancellation link.

**Architecture:** New Drizzle tables (`seats`, `ticket_types`, `bookings`, `booking_seats`) alongside the existing schema. Seat-hold concurrency is enforced with a Postgres row lock (`SELECT ... FOR UPDATE`) inside a transaction, not a DB constraint, since holds expire on a timer that a static constraint can't express. Payment confirmation is driven entirely by a Stripe webhook, never by the browser redirect. `lib/db/queries.ts` holds plain reads (seats, ticket types, a booking by id/token) following the existing codebase convention; `lib/booking/*.ts` holds the transactional writes (create/confirm/cancel) and does its own row-to-domain mapping, since a transaction handle (`tx`) and the default `db` handle are different Drizzle types and mixing them across that boundary is unnecessary risk for no benefit here.

**Tech Stack:** Next.js App Router (Server Components, a Client Component for the interactive seat map, Server Actions, a Route Handler for the webhook), Drizzle ORM (existing), Stripe SDK (`stripe`, Checkout Sessions + webhooks + refunds), Resend SDK (`resend`), Vitest + Playwright (existing).

## Global Constraints

- Guest checkout only — no user accounts, login, or "my bookings" view. (spec: Scope)
- Fixed 80-seat room: 8 rows × 5+5 seats with a center aisle, shared by every showtime — not per-movie or per-showtime data. (spec: Scope)
- Three ticket types: Adult, Child, Senior, each independently priced. (spec: Scope)
- Payment via Stripe **Checkout** (hosted redirect page) — not a custom Stripe Elements form. (spec: Scope)
- Stripe Checkout Sessions have a 30-minute *minimum* expiration; the 10-minute seat hold is tracked independently via `bookings.held_until`, checked at query time — no background cleanup job. (spec: Payment & Seat Holds)
- Booking confirmation happens via the Stripe webhook (`checkout.session.completed`), never via the browser's return-redirect. (spec: Payment & Seat Holds)
- Cancellation only via the emailed link; disallowed once the showtime has passed; a failed Stripe refund must never leave a booking falsely marked `cancelled`; revisiting an already-cancelled link shows "already cancelled", not an error. (spec: Booking Flow & Pages, Error Handling)
- Every price is stored as integer cents, never floating point. (spec: Data Model)
- `booking_seats.price_cents` snapshots the price at booking time — a later `ticket_types` price change must never retroactively change a past booking's total. (spec: Data Model)

---

## File Structure

```
lib/
  types.ts                                # Modify: add Seat, TicketType, Booking, BookingSeat, SeatAvailability, SeatSelection
  db/
    schema.ts                             # Modify: add seats, ticketTypes, bookings, bookingSeats tables + bookingStatus enum
    queries.ts                            # Modify: add getSeats, getTicketTypes, getBookingById, getBookingByCancellationToken, getBookingSeatsWithDetails
  booking/
    pricing.ts                            # Create: calculateTotalCents (pure)
    availability.ts                       # Create: getSeatAvailability
    create-booking.ts                     # Create: createPendingBooking, SeatUnavailableError
    create-checkout-session.ts            # Create: buildCheckoutSessionParams (pure), createCheckoutSessionForBooking
    confirm-booking.ts                    # Create: confirmBooking (webhook-driven)
    cancel-booking.ts                     # Create: cancelBooking
  stripe/
    client.ts                             # Create: stripe SDK instance
  email/
    resend-client.ts                      # Create: resend SDK instance
    booking-confirmation.ts               # Create: sendBookingConfirmationEmail
scripts/
  seed-seats.ts                           # Create: seeds the 80 fixed seats + 3 ticket types (run once)
app/
  movies/[id]/page.tsx                    # Modify: each showtime becomes a link to /book/[showtimeId]
  book/
    [showtimeId]/
      page.tsx                            # Create: Server Component — fetches data, renders SeatMap
      page.module.css                     # Create
      seat-map.tsx                        # Create: Client Component — interactive selection
      seat-map.module.css                 # Create
      actions.ts                          # Create: Server Action createBookingAction
    success/
      page.tsx                            # Create
      page.module.css                     # Create
  booking/
    cancel/
      [token]/
        page.tsx                          # Create
        page.module.css                   # Create
        actions.ts                        # Create: Server Action cancelBookingAction
  api/
    webhooks/
      stripe/
        route.ts                          # Create: POST handler
.env.example                              # Modify: add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY
package.json                              # Modify: add stripe, resend dependencies + seed:seats script
README.md                                 # Modify: document new env vars and the seed:seats step
tests/
  unit/
    pricing.test.ts                       # Create
    create-checkout-session.test.ts       # Create (buildCheckoutSessionParams only, no network call)
  integration/
    availability.test.ts                  # Create
    create-booking.test.ts                # Create — includes the concurrent-seat-claim test
    confirm-booking.test.ts               # Create — constructed Stripe event, no live Stripe call
    cancel-booking.test.ts                # Create
  e2e/
    booking.spec.ts                       # Create — seat selection through the Stripe redirect boundary
```

---

### Task 1: Data model — seats, ticket types, bookings, booking seats

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts`
- Test: none (schema-only; verified via migration + Task 2's seed)

**Interfaces:**
- Produces: Drizzle tables `seats`, `ticketTypes`, `bookings`, `bookingSeats`, enum `bookingStatus` — every later task imports these exact names from `lib/db/schema.ts`.
- Produces: domain types `Seat`, `TicketType`, `Booking`, `BookingSeat`, `SeatAvailability`, `SeatSelection` in `lib/types.ts` — every later task uses these exact shapes.

- [ ] **Step 1: Add domain types**

Add to `lib/types.ts` (append; do not remove the existing `MovieMetadata`/`Movie`/`Showtime` types):

```ts
export interface Seat {
  id: number;
  row: string;
  seatNumber: number;
  isAccessible: boolean;
}

export interface TicketType {
  id: number;
  code: string;
  label: string;
  priceCents: number;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface Booking {
  id: number;
  showtimeId: number;
  customerName: string;
  customerEmail: string;
  status: BookingStatus;
  heldUntil: Date | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  cancellationToken: string;
  totalCents: number;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export interface BookingSeat {
  id: number;
  bookingId: number;
  seatId: number;
  ticketTypeId: number;
  priceCents: number;
}

export interface SeatAvailability extends Seat {
  available: boolean;
}

export interface SeatSelection {
  seatId: number;
  ticketTypeId: number;
}
```

- [ ] **Step 2: Add the new tables to the schema**

Add to `lib/db/schema.ts` (append; do not remove `movies`/`showtimes`):

```ts
import { pgEnum, boolean, unique } from 'drizzle-orm/pg-core';
```

Add this import to the existing `import { pgTable, serial, integer, text, numeric, timestamp } from 'drizzle-orm/pg-core';` line instead of a separate line, so the final import reads:

```ts
import { pgTable, pgEnum, serial, integer, text, numeric, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
```

Then append:

```ts
export const bookingStatus = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled']);

export const seats = pgTable(
  'seats',
  {
    id: serial('id').primaryKey(),
    row: text('row').notNull(),
    seatNumber: integer('seat_number').notNull(),
    isAccessible: boolean('is_accessible').notNull().default(false),
  },
  (table) => [unique('seats_row_seat_number_unique').on(table.row, table.seatNumber)],
);

export const ticketTypes = pgTable('ticket_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  priceCents: integer('price_cents').notNull(),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  showtimeId: integer('showtime_id')
    .notNull()
    .references(() => showtimes.id),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  status: bookingStatus('status').notNull().default('pending'),
  heldUntil: timestamp('held_until'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  cancellationToken: text('cancellation_token').notNull().unique(),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at'),
  cancelledAt: timestamp('cancelled_at'),
});

export const bookingSeats = pgTable('booking_seats', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .notNull()
    .references(() => bookings.id),
  seatId: integer('seat_id')
    .notNull()
    .references(() => seats.id),
  ticketTypeId: integer('ticket_type_id')
    .notNull()
    .references(() => ticketTypes.id),
  priceCents: integer('price_cents').notNull(),
});
```

- [ ] **Step 3: Generate and apply the migration**

```bash
set -a; source .env.local; set +a
npm run db:generate
npm run db:migrate -- "$DATABASE_URL"
npm run db:migrate -- "$TEST_DATABASE_URL"
```

Expected: a new file appears under `drizzle/`, and both commands print `Migrations applied`.

- [ ] **Step 4: Verify the tables exist**

```bash
docker compose exec db psql -U retfenymozi -d retfenymozi -c '\dt'
```

Expected: lists `movies`, `showtimes`, `seats`, `ticket_types`, `bookings`, `booking_seats`.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db/schema.ts drizzle/
git commit -m "feat: add seats, ticket types, bookings, and booking seats schema"
```

---

### Task 2: Seed script for seats and ticket types

**Files:**
- Create: `scripts/seed-seats.ts`
- Modify: `package.json` (add `seed:seats` script)

**Interfaces:**
- Consumes: `seats`, `ticketTypes` (Task 1)
- Produces: 80 rows in `seats` (rows A–H, seat numbers 1–10, with 4 accessible seats), 3 rows in `ticket_types` (`adult` $12.00, `child` $8.00, `senior` $10.00) — every later task's tests assume these exact codes/prices exist once seeded.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-seats.ts`:

```ts
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

if (require.main === module) {
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
```

**Note:** this project's `.ts` scripts run as ESM via `tsx`, where `require` is undefined — `require.main === module` will throw. Use the same pattern already established in `scripts/seed-movie.ts` and `scripts/seed-fixture.ts` instead:

```ts
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
```

- [ ] **Step 2: Add the npm script**

Add to `package.json` `"scripts"`:

```json
"seed:seats": "tsx scripts/seed-seats.ts"
```

- [ ] **Step 3: Run it locally and verify**

```bash
set -a; source .env.local; set +a
npm run seed:seats
docker compose exec db psql -U retfenymozi -d retfenymozi -c 'SELECT count(*) FROM seats;'
docker compose exec db psql -U retfenymozi -d retfenymozi -c 'SELECT code, price_cents FROM ticket_types ORDER BY price_cents;'
```

Expected: seat count is 80; ticket types show `child|800`, `senior|1000`, `adult|1200`.

- [ ] **Step 4: Run it again to confirm it's idempotent**

```bash
npm run seed:seats
docker compose exec db psql -U retfenymozi -d retfenymozi -c 'SELECT count(*) FROM seats;'
```

Expected: still 80 (the `onConflictDoNothing()` means re-running doesn't duplicate rows) — this matters because CI/preview environments may run this script more than once.

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-seats.ts package.json
git commit -m "feat: add seed script for seats and ticket types"
```

---

### Task 3: Seat availability

**Files:**
- Create: `lib/booking/availability.ts`
- Modify: `lib/db/queries.ts` (add `getSeats`, `getTicketTypes`)
- Test: `tests/integration/availability.test.ts`

**Interfaces:**
- Consumes: `seats`, `ticketTypes`, `bookings`, `bookingSeats` (Task 1), seeded data (Task 2)
- Produces: `getSeats(db?): Promise<Seat[]>`, `getTicketTypes(db?): Promise<TicketType[]>` in `lib/db/queries.ts`; `getSeatAvailability(showtimeId: number, db?): Promise<SeatAvailability[]>` in `lib/booking/availability.ts` — Task 8 (booking page) calls both.

- [ ] **Step 1: Add plain reads to `lib/db/queries.ts`**

Add to the imports at the top of `lib/db/queries.ts`:

```ts
import { seats, ticketTypes } from './schema';
import type { Seat, TicketType } from '../types';
```

(combine with the existing `import { movies, showtimes } from './schema';` and `import type { Movie, Showtime } from '../types';` lines rather than adding duplicate import statements for the same module)

Add these row mappers near the existing `rowToMovie`/`rowToShowtime`:

```ts
function rowToSeat(row: typeof seats.$inferSelect): Seat {
  return { id: row.id, row: row.row, seatNumber: row.seatNumber, isAccessible: row.isAccessible };
}

function rowToTicketType(row: typeof ticketTypes.$inferSelect): TicketType {
  return { id: row.id, code: row.code, label: row.label, priceCents: row.priceCents };
}
```

Add these functions:

```ts
export async function getSeats(db: Database = defaultDb): Promise<Seat[]> {
  const rows = await db.select().from(seats).orderBy(seats.row, seats.seatNumber);
  return rows.map(rowToSeat);
}

export async function getTicketTypes(db: Database = defaultDb): Promise<TicketType[]> {
  const rows = await db.select().from(ticketTypes).orderBy(ticketTypes.priceCents);
  return rows.map(rowToTicketType);
}
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/availability.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { getSeatAvailability } from '../../lib/booking/availability';

const db = createDb(process.env.TEST_DATABASE_URL!);

const movieFixture = {
  tmdbId: 900001,
  imdbId: 'tt9000001',
  title: 'Availability Test Movie',
  synopsis: 'Fixture.',
  posterUrl: null,
  runtime: 100,
  director: null,
  actors: [],
  imdbRating: null,
  trailerUrl: null,
};

describe('getSeatAvailability', () => {
  beforeEach(async () => {
    await db.delete(bookingSeats);
    await db.delete(bookings);
    await db.delete(showtimes);
    await db.delete(movies);
    await db.delete(seats);
    await db.delete(ticketTypes);

    await db.insert(seats).values([
      { row: 'A', seatNumber: 1, isAccessible: false },
      { row: 'A', seatNumber: 2, isAccessible: false },
    ]);
    await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 });
  });

  it('marks every seat available when nothing is booked', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();

    const availability = await getSeatAvailability(showtime.id, db);

    expect(availability).toHaveLength(2);
    expect(availability.every((seat) => seat.available)).toBe(true);
  });

  it('marks a seat unavailable when confirmed for that showtime', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
    const [ticketType] = await db.select().from(ticketTypes).limit(1);
    const [seatA1] = await db.select().from(seats).where(eq(seats.row, 'A')).limit(1);

    const [booking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtime.id,
        customerName: 'Test',
        customerEmail: 'test@example.com',
        status: 'confirmed',
        cancellationToken: 'test-token-1',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seatA1.id, ticketTypeId: ticketType.id, priceCents: 1200 });

    const availability = await getSeatAvailability(showtime.id, db);
    const seatA1Availability = availability.find((s) => s.id === seatA1.id);

    expect(seatA1Availability?.available).toBe(false);
    expect(availability.filter((s) => s.available)).toHaveLength(1);
  });

  it('marks a seat available again once its pending hold has expired', async () => {
    const [movie] = await db.insert(movies).values(movieFixture).returning();
    const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
    const [ticketType] = await db.select().from(ticketTypes).limit(1);
    const [seatA1] = await db.select().from(seats).where(eq(seats.row, 'A')).limit(1);

    const [booking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtime.id,
        customerName: 'Test',
        customerEmail: 'test@example.com',
        status: 'pending',
        heldUntil: new Date(Date.now() - 1000), // already expired
        cancellationToken: 'test-token-2',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seatA1.id, ticketTypeId: ticketType.id, priceCents: 1200 });

    const availability = await getSeatAvailability(showtime.id, db);
    const seatA1Availability = availability.find((s) => s.id === seatA1.id);

    expect(seatA1Availability?.available).toBe(true);
  });
});
```

Add `eq` to the imports: `import { eq } from 'drizzle-orm';`

- [ ] **Step 3: Run test to verify it fails**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/availability.test.ts`
Expected: FAIL — `lib/booking/availability.ts` does not exist.

- [ ] **Step 4: Write the implementation**

Create `lib/booking/availability.ts`:

```ts
import { and, eq, gt, or } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { bookings, bookingSeats } from '../db/schema';
import { getSeats } from '../db/queries';
import type { SeatAvailability } from '../types';

type Database = typeof defaultDb;

export async function getSeatAvailability(showtimeId: number, db: Database = defaultDb): Promise<SeatAvailability[]> {
  const allSeats = await getSeats(db);

  const claimedRows = await db
    .select({ seatId: bookingSeats.seatId })
    .from(bookingSeats)
    .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.showtimeId, showtimeId),
        or(eq(bookings.status, 'confirmed'), and(eq(bookings.status, 'pending'), gt(bookings.heldUntil, new Date()))),
      ),
    );

  const claimedSeatIds = new Set(claimedRows.map((row) => row.seatId));

  return allSeats.map((seat) => ({ ...seat, available: !claimedSeatIds.has(seat.id) }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/availability.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts lib/booking/availability.ts tests/integration/availability.test.ts
git commit -m "feat: add seat availability computation"
```

---

### Task 4: Pricing calculation

**Files:**
- Create: `lib/booking/pricing.ts`
- Test: `tests/unit/pricing.test.ts`

**Interfaces:**
- Consumes: `SeatSelection`, `TicketType` (Task 1)
- Produces: `calculateTotalCents(selections: SeatSelection[], ticketTypes: TicketType[]): number` — Task 6 (create-booking) and Task 7 (checkout session) both call this.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pricing.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pricing.test.ts`
Expected: FAIL — `lib/booking/pricing.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/booking/pricing.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/pricing.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/booking/pricing.ts tests/unit/pricing.test.ts
git commit -m "feat: add ticket price calculation"
```

---

### Task 5: Stripe and Resend clients, env config

**Files:**
- Create: `lib/stripe/client.ts`
- Create: `lib/email/resend-client.ts`
- Modify: `.env.example`
- Modify: `package.json` (add `stripe`, `resend` dependencies)
- Modify: `README.md` (document the three new env vars)

**Interfaces:**
- Produces: `stripe` (default Stripe SDK instance) from `lib/stripe/client.ts`; `resend` (default Resend SDK instance) from `lib/email/resend-client.ts` — Tasks 7, 9, 10, 12 import these.

- [ ] **Step 1: Install dependencies**

```bash
npm install stripe resend
```

- [ ] **Step 2: Add the Stripe client**

Create `lib/stripe/client.ts`:

```ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

If TypeScript reports that the `Stripe` constructor requires an explicit `apiVersion` option, add whatever version string the type error itself reports as the expected literal (the installed SDK version pins a specific default API version internally; follow the compiler's suggestion rather than guessing a version string).

- [ ] **Step 3: Add the Resend client**

Create `lib/email/resend-client.ts`:

```ts
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY!);
```

- [ ] **Step 4: Update `.env.example`**

Add to `.env.example`:

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
```

- [ ] **Step 5: Update README**

In `README.md`'s "Local development" section, add a note after the existing `.env.local` setup step:

```markdown
Booking (seats, payments, email) additionally needs:
- `STRIPE_SECRET_KEY` — a Stripe **test-mode** secret key (free, from the Stripe dashboard). Required for the booking E2E test and for actually completing a checkout locally; not required for unit/integration tests, which either test pure functions or use a constructed Stripe event rather than a live API call.
- `STRIPE_WEBHOOK_SECRET` — from `stripe listen --forward-to localhost:3000/api/webhooks/stripe` when testing webhooks locally (the Stripe CLI prints a `whsec_...` value), or from the webhook endpoint's settings in the Stripe dashboard once deployed.
- `RESEND_API_KEY` — a free Resend API key, needed to actually send confirmation emails.

Run `npm run seed:seats` once to populate the 80 fixed seats and the three ticket types (Adult/Child/Senior) — this only needs to happen once per database, not per movie.
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0. (This will fail if `STRIPE_SECRET_KEY`/`RESEND_API_KEY` are unset in your shell at typecheck time only if the SDK constructors validate at import time in a way that breaks module loading — if so, that's a real signal the client files need lazier initialization; investigate rather than silencing it, but this is not expected with either SDK's standard constructor.)

- [ ] **Step 7: Commit**

```bash
git add lib/stripe/client.ts lib/email/resend-client.ts .env.example README.md package.json package-lock.json
git commit -m "feat: add Stripe and Resend clients"
```

---

### Task 6: Create pending booking (concurrency-safe)

**Files:**
- Create: `lib/booking/create-booking.ts`
- Test: `tests/integration/create-booking.test.ts`

**Interfaces:**
- Consumes: `bookings`, `bookingSeats`, `seats`, `ticketTypes` (Task 1), `calculateTotalCents` (Task 4)
- Produces: `createPendingBooking(showtimeId: number, selections: SeatSelection[], customerName: string, customerEmail: string, db?): Promise<Booking>`, `SeatUnavailableError` (an `Error` subclass with a `seatIds: number[]` property) — Task 8's server action and Task 13's E2E test both depend on this exact signature and error type.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/create-booking.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { createPendingBooking, SeatUnavailableError } from '../../lib/booking/create-booking';

const db = createDb(process.env.TEST_DATABASE_URL!);

const movieFixture = {
  tmdbId: 900002,
  imdbId: 'tt9000002',
  title: 'Create Booking Test Movie',
  synopsis: 'Fixture.',
  posterUrl: null,
  runtime: 100,
  director: null,
  actors: [],
  imdbRating: null,
  trailerUrl: null,
};

async function seedShowtimeWithSeats() {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db.insert(movies).values(movieFixture).returning();
  const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
  const [ticketType] = await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 }).returning();
  const seedSeats = await db
    .insert(seats)
    .values([
      { row: 'A', seatNumber: 1, isAccessible: false },
      { row: 'A', seatNumber: 2, isAccessible: false },
    ])
    .returning();

  return { showtime, ticketType, seedSeats };
}

describe('createPendingBooking', () => {
  beforeEach(seedShowtimeWithSeats);

  it('creates a pending booking with its seats and a 10-minute hold', async () => {
    const { showtime, ticketType, seedSeats } = await seedShowtimeWithSeats();

    const booking = await createPendingBooking(
      showtime.id,
      [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }],
      'Jane Doe',
      'jane@example.com',
      db,
    );

    expect(booking.status).toBe('pending');
    expect(booking.totalCents).toBe(1200);
    expect(booking.heldUntil).not.toBeNull();
    expect(booking.heldUntil!.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    expect(booking.heldUntil!.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);

    const seatRows = await db.select().from(bookingSeats).where(eq(bookingSeats.bookingId, booking.id));
    expect(seatRows).toHaveLength(1);
    expect(seatRows[0].priceCents).toBe(1200);
  });

  it('rejects a seat that is already confirmed for that showtime', async () => {
    const { showtime, ticketType, seedSeats } = await seedShowtimeWithSeats();

    const [existingBooking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtime.id,
        customerName: 'Existing',
        customerEmail: 'existing@example.com',
        status: 'confirmed',
        cancellationToken: 'existing-token',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: existingBooking.id, seatId: seedSeats[0].id, ticketTypeId: ticketType.id, priceCents: 1200 });

    await expect(
      createPendingBooking(showtime.id, [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }], 'Jane Doe', 'jane@example.com', db),
    ).rejects.toThrow(SeatUnavailableError);

    const allBookings = await db.select().from(bookings);
    expect(allBookings).toHaveLength(1); // the rejected attempt created no row
  });

  it('rejects one concurrent claim on the same seat and lets the other through', async () => {
    const { showtime, ticketType, seedSeats } = await seedShowtimeWithSeats();

    const results = await Promise.allSettled([
      createPendingBooking(showtime.id, [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }], 'Customer A', 'a@example.com', db),
      createPendingBooking(showtime.id, [{ seatId: seedSeats[0].id, ticketTypeId: ticketType.id }], 'Customer B', 'b@example.com', db),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SeatUnavailableError);

    const allBookings = await db.select().from(bookings);
    expect(allBookings).toHaveLength(1); // only the winner's booking exists
  });
});
```

Add `eq` to the imports: `import { eq } from 'drizzle-orm';`

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/create-booking.test.ts`
Expected: FAIL — `lib/booking/create-booking.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/booking/create-booking.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, or } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { seats, bookings, bookingSeats, ticketTypes } from '../db/schema';
import { calculateTotalCents } from './pricing';
import type { SeatSelection, Booking } from '../types';

type Database = typeof defaultDb;

export class SeatUnavailableError extends Error {
  seatIds: number[];

  constructor(seatIds: number[]) {
    super(`Seat(s) no longer available: ${seatIds.join(', ')}`);
    this.name = 'SeatUnavailableError';
    this.seatIds = seatIds;
  }
}

const HOLD_DURATION_MS = 10 * 60 * 1000;

export async function createPendingBooking(
  showtimeId: number,
  selections: SeatSelection[],
  customerName: string,
  customerEmail: string,
  db: Database = defaultDb,
): Promise<Booking> {
  return db.transaction(async (tx) => {
    const seatIds = selections.map((s) => s.seatId);

    // Lock the requested seat rows for the life of this transaction so a
    // concurrent attempt on the same seat blocks until this one commits or
    // rolls back, then re-sees accurate availability. This locks the `seats`
    // table rows themselves (not a per-showtime lock), so a concurrent
    // booking attempt for a *different* showtime that happens to touch the
    // same physical seat numbers briefly serializes too — an acceptable cost
    // for a single-screen cinema's traffic, in exchange for a much simpler
    // locking scheme than per-(showtime,seat) advisory locks.
    await tx.select().from(seats).where(inArray(seats.id, seatIds)).for('update');

    const claimedRows = await tx
      .select({ seatId: bookingSeats.seatId })
      .from(bookingSeats)
      .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.showtimeId, showtimeId),
          inArray(bookingSeats.seatId, seatIds),
          or(eq(bookings.status, 'confirmed'), and(eq(bookings.status, 'pending'), gt(bookings.heldUntil, new Date()))),
        ),
      );

    if (claimedRows.length > 0) {
      throw new SeatUnavailableError(claimedRows.map((r) => r.seatId));
    }

    const allTicketTypes = await tx.select().from(ticketTypes);
    const priceByTicketTypeId = new Map(allTicketTypes.map((t) => [t.id, t.priceCents]));
    const totalCents = calculateTotalCents(
      selections,
      allTicketTypes.map((t) => ({ id: t.id, code: t.code, label: t.label, priceCents: t.priceCents })),
    );

    const [bookingRow] = await tx
      .insert(bookings)
      .values({
        showtimeId,
        customerName,
        customerEmail,
        status: 'pending',
        heldUntil: new Date(Date.now() + HOLD_DURATION_MS),
        cancellationToken: randomUUID(),
        totalCents,
      })
      .returning();

    await tx.insert(bookingSeats).values(
      selections.map((selection) => ({
        bookingId: bookingRow.id,
        seatId: selection.seatId,
        ticketTypeId: selection.ticketTypeId,
        priceCents: priceByTicketTypeId.get(selection.ticketTypeId)!,
      })),
    );

    return {
      id: bookingRow.id,
      showtimeId: bookingRow.showtimeId,
      customerName: bookingRow.customerName,
      customerEmail: bookingRow.customerEmail,
      status: bookingRow.status,
      heldUntil: bookingRow.heldUntil,
      stripeCheckoutSessionId: bookingRow.stripeCheckoutSessionId,
      stripePaymentIntentId: bookingRow.stripePaymentIntentId,
      cancellationToken: bookingRow.cancellationToken,
      totalCents: bookingRow.totalCents,
      createdAt: bookingRow.createdAt,
      confirmedAt: bookingRow.confirmedAt,
      cancelledAt: bookingRow.cancelledAt,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/create-booking.test.ts`
Expected: PASS (3 tests). If the concurrency test is flaky (both succeed, or both fail), the `FOR UPDATE` lock is not actually serializing the two transactions — check that both calls share the same underlying Postgres connection pool pointed at `TEST_DATABASE_URL` and that `tx.select().from(seats)...for('update')` runs before the availability check, not after.

- [ ] **Step 5: Commit**

```bash
git add lib/booking/create-booking.ts tests/integration/create-booking.test.ts
git commit -m "feat: add concurrency-safe pending booking creation"
```

---

### Task 7: Stripe Checkout Session creation

**Files:**
- Create: `lib/booking/create-checkout-session.ts`
- Test: `tests/unit/create-checkout-session.test.ts`

**Interfaces:**
- Consumes: `stripe` (Task 5), `Booking`, `Seat`, `TicketType` (Task 1), `Movie`, `Showtime` (existing)
- Produces: `buildCheckoutSessionParams(...)` (pure, unit-tested), `createCheckoutSessionForBooking(booking: Booking, movie: Movie, showtime: Showtime, bookingSeatDetails: Array<{ seat: Seat; ticketType: TicketType }>, db?): Promise<string>` (returns the Checkout Session URL, and updates `bookings.stripe_checkout_session_id`) — Task 8's server action calls this.

- [ ] **Step 1: Write the failing unit test for the pure params builder**

Create `tests/unit/create-checkout-session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCheckoutSessionParams } from '../../lib/booking/create-checkout-session';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../../lib/types';

const movie: Movie = {
  id: 1,
  tmdbId: 27205,
  imdbId: 'tt1375666',
  title: 'Inception',
  synopsis: 'A thief who steals corporate secrets.',
  posterUrl: null,
  runtime: 148,
  director: 'Christopher Nolan',
  actors: ['Leonardo DiCaprio'],
  imdbRating: 8.8,
  trailerUrl: null,
};

const showtime: Showtime = { id: 10, movieId: 1, startTime: new Date('2026-08-01T18:00:00Z') };

const booking: Booking = {
  id: 5,
  showtimeId: 10,
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  status: 'pending',
  heldUntil: new Date(Date.now() + 10 * 60 * 1000),
  stripeCheckoutSessionId: null,
  stripePaymentIntentId: null,
  cancellationToken: 'token-abc',
  totalCents: 2000,
  createdAt: new Date(),
  confirmedAt: null,
  cancelledAt: null,
};

const seatDetails: Array<{ seat: Seat; ticketType: TicketType }> = [
  { seat: { id: 1, row: 'A', seatNumber: 1, isAccessible: false }, ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 } },
  { seat: { id: 2, row: 'A', seatNumber: 2, isAccessible: false }, ticketType: { id: 2, code: 'child', label: 'Child', priceCents: 800 } },
];

describe('buildCheckoutSessionParams', () => {
  it('creates one line item per ticket type with the correct quantity and price', () => {
    const params = buildCheckoutSessionParams(booking, movie, showtime, seatDetails, 'https://example.com');

    expect(params.mode).toBe('payment');
    expect(params.customer_email).toBe('jane@example.com');
    expect(params.metadata).toEqual({ bookingId: '5' });
    expect(params.success_url).toBe('https://example.com/book/success?booking_id=5');
    expect(params.cancel_url).toBe('https://example.com/book/10');

    expect(params.line_items).toHaveLength(2);
    const adultLine = params.line_items!.find((li) => (li.price_data as { product_data: { name: string } }).product_data.name.includes('Adult'));
    expect(adultLine).toMatchObject({ quantity: 1, price_data: { currency: 'usd', unit_amount: 1200 } });
    const childLine = params.line_items!.find((li) => (li.price_data as { product_data: { name: string } }).product_data.name.includes('Child'));
    expect(childLine).toMatchObject({ quantity: 1, price_data: { currency: 'usd', unit_amount: 800 } });
  });

  it('groups multiple seats of the same ticket type into one line item with quantity > 1', () => {
    const twoAdults = [
      { seat: { id: 1, row: 'A', seatNumber: 1, isAccessible: false }, ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 } },
      { seat: { id: 2, row: 'A', seatNumber: 2, isAccessible: false }, ticketType: { id: 1, code: 'adult', label: 'Adult', priceCents: 1200 } },
    ];

    const params = buildCheckoutSessionParams(booking, movie, showtime, twoAdults, 'https://example.com');

    expect(params.line_items).toHaveLength(1);
    expect(params.line_items![0]).toMatchObject({ quantity: 2, price_data: { unit_amount: 1200 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/create-checkout-session.test.ts`
Expected: FAIL — `lib/booking/create-checkout-session.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/booking/create-checkout-session.ts`:

```ts
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { stripe } from '../stripe/client';
import { db as defaultDb } from '../db/client';
import { bookings } from '../db/schema';
import { formatShowtime } from '../format';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../types';

type Database = typeof defaultDb;

export function buildCheckoutSessionParams(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType }>,
  siteUrl: string,
): Stripe.Checkout.SessionCreateParams {
  const quantityByTicketType = new Map<number, { ticketType: TicketType; quantity: number }>();
  for (const { ticketType } of seatDetails) {
    const existing = quantityByTicketType.get(ticketType.id);
    quantityByTicketType.set(ticketType.id, { ticketType, quantity: (existing?.quantity ?? 0) + 1 });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = Array.from(quantityByTicketType.values()).map(
    ({ ticketType, quantity }) => ({
      quantity,
      price_data: {
        currency: 'usd',
        unit_amount: ticketType.priceCents,
        product_data: {
          name: `${ticketType.label} ticket — ${movie.title} (${formatShowtime(showtime.startTime)})`,
        },
      },
    }),
  );

  return {
    mode: 'payment',
    customer_email: booking.customerEmail,
    line_items: lineItems,
    metadata: { bookingId: String(booking.id) },
    success_url: `${siteUrl}/book/success?booking_id=${booking.id}`,
    cancel_url: `${siteUrl}/book/${showtime.id}`,
  };
}

export async function createCheckoutSessionForBooking(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType }>,
  db: Database = defaultDb,
): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const params = buildCheckoutSessionParams(booking, movie, showtime, seatDetails, siteUrl);

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout Session URL');
  }

  await db.update(bookings).set({ stripeCheckoutSessionId: session.id }).where(eq(bookings.id, booking.id));

  return session.url;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/create-checkout-session.test.ts`
Expected: PASS (2 tests) — these test `buildCheckoutSessionParams` only, a pure function; no Stripe API call happens in this test, so no `STRIPE_SECRET_KEY` is needed for it to pass.

- [ ] **Step 5: Add `NEXT_PUBLIC_SITE_URL` to `.env.example`**

Add to `.env.example`:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add lib/booking/create-checkout-session.ts tests/unit/create-checkout-session.test.ts .env.example
git commit -m "feat: add Stripe Checkout Session creation"
```

---

### Task 8: Booking page — seat map, ticket selector, server action

**Files:**
- Create: `app/book/[showtimeId]/page.tsx`
- Create: `app/book/[showtimeId]/page.module.css`
- Create: `app/book/[showtimeId]/seat-map.tsx`
- Create: `app/book/[showtimeId]/seat-map.module.css`
- Create: `app/book/[showtimeId]/actions.ts`
- Modify: `lib/db/queries.ts` (add `getShowtimeById`)

**Interfaces:**
- Consumes: `getSeatAvailability` (Task 3), `getTicketTypes` (Task 3), `createPendingBooking`, `SeatUnavailableError` (Task 6), `createCheckoutSessionForBooking` (Task 7), `getMovieById` (existing), `getBookingSeatsWithDetails` (this task adds it)
- Produces: `createBookingAction(showtimeId: number, formData: FormData): Promise<{ error: string } | never>` (a Server Action — on success it `redirect()`s, so its only observable return is the error case) — the E2E test in Task 13 drives this form.

- [ ] **Step 1: Add `getShowtimeById` and `getBookingSeatsWithDetails` to `lib/db/queries.ts`**

By this point (after Task 3), `lib/db/queries.ts` imports `{ movies, showtimes, seats, ticketTypes }` from `./schema'` and `type { Movie, Showtime, Seat, TicketType }` from `'../types'`. Extend both of those same import lines further — do not add new, separate import statements for the same modules — to `import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from './schema';` and `import type { Movie, Showtime, Seat, TicketType, Booking } from '../types';`.

Add this row mapper near the others:

```ts
function rowToBooking(row: typeof bookings.$inferSelect): Booking {
  return {
    id: row.id,
    showtimeId: row.showtimeId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    status: row.status,
    heldUntil: row.heldUntil,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    cancellationToken: row.cancellationToken,
    totalCents: row.totalCents,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    cancelledAt: row.cancelledAt,
  };
}
```

Add these functions:

```ts
export async function getShowtimeById(id: number, db: Database = defaultDb): Promise<Showtime | null> {
  const rows = await db.select().from(showtimes).where(eq(showtimes.id, id)).limit(1);
  return rows[0] ? rowToShowtime(rows[0]) : null;
}

export async function getBookingById(id: number, db: Database = defaultDb): Promise<Booking | null> {
  const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return rows[0] ? rowToBooking(rows[0]) : null;
}

export async function getBookingByCancellationToken(token: string, db: Database = defaultDb): Promise<Booking | null> {
  const rows = await db.select().from(bookings).where(eq(bookings.cancellationToken, token)).limit(1);
  return rows[0] ? rowToBooking(rows[0]) : null;
}

export async function getBookingSeatsWithDetails(
  bookingId: number,
  db: Database = defaultDb,
): Promise<Array<{ seat: Seat; ticketType: TicketType; priceCents: number }>> {
  const rows = await db
    .select()
    .from(bookingSeats)
    .innerJoin(seats, eq(bookingSeats.seatId, seats.id))
    .innerJoin(ticketTypes, eq(bookingSeats.ticketTypeId, ticketTypes.id))
    .where(eq(bookingSeats.bookingId, bookingId));

  return rows.map((row) => ({
    seat: { id: row.seats.id, row: row.seats.row, seatNumber: row.seats.seatNumber, isAccessible: row.seats.isAccessible },
    ticketType: { id: row.ticketTypes.id, code: row.ticketTypes.code, label: row.ticketTypes.label, priceCents: row.ticketTypes.priceCents },
    priceCents: row.bookingSeats.priceCents,
  }));
}
```

- [ ] **Step 2: Write the seat map Client Component**

Create `app/book/[showtimeId]/seat-map.module.css`:

```css
.grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-lg);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  justify-content: center;
}

.rowLabel {
  width: 20px;
  font-size: 0.75rem;
  color: var(--color-fg-muted);
  text-align: right;
}

.seat {
  width: 28px;
  height: 28px;
  border-radius: 4px 4px 2px 2px;
  border: 1px solid var(--color-border);
  background: rgba(242, 237, 231, 0.1);
  color: var(--color-fg-muted);
  font-size: 0.65rem;
  cursor: pointer;
}

.seat:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.seatSelected {
  background: var(--color-accent);
  color: var(--color-fg);
  border-color: var(--color-accent);
}

.aisle {
  width: 20px;
}

.ticketSteppers {
  display: flex;
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.stepper {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.error {
  color: var(--color-accent-text);
  margin-bottom: var(--space-md);
}
```

Create `app/book/[showtimeId]/seat-map.tsx`:

```tsx
'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import type { SeatAvailability, TicketType } from '@/lib/types';
import styles from './seat-map.module.css';

export function SeatMap({
  showtimeId,
  seats,
  ticketTypes,
  createBookingAction,
}: {
  showtimeId: number;
  seats: SeatAvailability[];
  ticketTypes: TicketType[];
  createBookingAction: (showtimeId: number, formData: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(ticketTypes.map((t) => [t.id, 0])),
  );
  const [selectedSeatIds, setSelectedSeatIds] = useState<number[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalTicketsRequested = useMemo(() => Object.values(quantities).reduce((a, b) => a + b, 0), [quantities]);

  const rows = useMemo(() => {
    const byRow = new Map<string, SeatAvailability[]>();
    for (const seat of seats) {
      const existing = byRow.get(seat.row) ?? [];
      existing.push(seat);
      byRow.set(seat.row, existing);
    }
    return Array.from(byRow.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [seats]);

  function toggleSeat(seatId: number) {
    setSelectedSeatIds((current) => {
      if (current.includes(seatId)) {
        return current.filter((id) => id !== seatId);
      }
      if (current.length >= totalTicketsRequested) {
        return current;
      }
      return [...current, seatId];
    });
  }

  function submit() {
    setError(null);

    if (totalTicketsRequested === 0) {
      setError('Select at least one ticket.');
      return;
    }
    if (selectedSeatIds.length !== totalTicketsRequested) {
      setError(`Select exactly ${totalTicketsRequested} seat(s) to match your ticket count.`);
      return;
    }
    if (!customerName.trim() || !customerEmail.trim()) {
      setError('Enter your name and email.');
      return;
    }

    // Assigns selected seats to ticket types in the order each type was
    // requested — the simplest possible mapping given seats within a
    // selection are otherwise interchangeable for pricing purposes.
    const ticketTypeIdPerSeat: number[] = [];
    for (const [ticketTypeId, quantity] of Object.entries(quantities)) {
      for (let i = 0; i < quantity; i++) {
        ticketTypeIdPerSeat.push(Number(ticketTypeId));
      }
    }

    const formData = new FormData();
    formData.set('customerName', customerName);
    formData.set('customerEmail', customerEmail);
    formData.set(
      'selections',
      JSON.stringify(selectedSeatIds.map((seatId, index) => ({ seatId, ticketTypeId: ticketTypeIdPerSeat[index] }))),
    );

    startTransition(async () => {
      const result = await createBookingAction(showtimeId, formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div className={styles.ticketSteppers}>
        {ticketTypes.map((ticketType) => (
          <div key={ticketType.id} className={styles.stepper}>
            <label htmlFor={`qty-${ticketType.id}`}>
              {ticketType.label} (${(ticketType.priceCents / 100).toFixed(2)})
            </label>
            <input
              id={`qty-${ticketType.id}`}
              type="number"
              min={0}
              max={10}
              value={quantities[ticketType.id]}
              onChange={(e) =>
                setQuantities((current) => ({ ...current, [ticketType.id]: Math.max(0, Number(e.target.value)) }))
              }
            />
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {rows.map(([row, rowSeats]) => (
          <div key={row} className={styles.row}>
            <span className={styles.rowLabel}>{row}</span>
            {rowSeats
              .sort((a, b) => a.seatNumber - b.seatNumber)
              .map((seat, i) => (
                <Fragment key={seat.id}>
                  {i === Math.ceil(rowSeats.length / 2) && <span className={styles.aisle} />}
                  <button
                    type="button"
                    disabled={!seat.available}
                    onClick={() => toggleSeat(seat.id)}
                    className={selectedSeatIds.includes(seat.id) ? styles.seatSelected : styles.seat}
                    aria-label={`Seat ${seat.row}${seat.seatNumber}${seat.isAccessible ? ' (accessible)' : ''}`}
                  >
                    {seat.seatNumber}
                  </button>
                </Fragment>
              ))}
          </div>
        ))}
      </div>

      <div>
        <label htmlFor="customerName">Name</label>
        <input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="customerEmail">Email</label>
        <input id="customerEmail" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="button" onClick={submit} disabled={isPending}>
        Continue to payment
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write the server action**

Create `app/book/[showtimeId]/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createPendingBooking, SeatUnavailableError } from '@/lib/booking/create-booking';
import { createCheckoutSessionForBooking } from '@/lib/booking/create-checkout-session';
import { getMovieById, getShowtimeById, getBookingSeatsWithDetails, getBookingById } from '@/lib/db/queries';
import type { SeatSelection } from '@/lib/types';

export async function createBookingAction(showtimeId: number, formData: FormData): Promise<{ error: string } | undefined> {
  const customerName = String(formData.get('customerName') ?? '').trim();
  const customerEmail = String(formData.get('customerEmail') ?? '').trim();
  const selections = JSON.parse(String(formData.get('selections') ?? '[]')) as SeatSelection[];

  if (!customerName || !customerEmail || selections.length === 0) {
    return { error: 'Missing required booking details.' };
  }

  const showtime = await getShowtimeById(showtimeId);
  if (!showtime) {
    return { error: 'This showtime no longer exists.' };
  }

  const movie = await getMovieById(showtime.movieId);
  if (!movie) {
    return { error: 'This movie no longer exists.' };
  }

  let bookingId: number;
  try {
    const booking = await createPendingBooking(showtimeId, selections, customerName, customerEmail);
    bookingId = booking.id;
  } catch (err) {
    if (err instanceof SeatUnavailableError) {
      return { error: 'One or more of your selected seats was just taken. Please choose again.' };
    }
    throw err;
  }

  const seatDetails = await getBookingSeatsWithDetails(bookingId);
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { error: 'Something went wrong creating your booking. Please try again.' };
  }

  const checkoutUrl = await createCheckoutSessionForBooking(booking, movie, showtime, seatDetails);

  redirect(checkoutUrl);
}
```

Note: `redirect()` throws internally as control flow — do not wrap the call to `createBookingAction`'s final `redirect(checkoutUrl)` line in a `try`/`catch` that would swallow it (it isn't, here, but keep this in mind if you touch this function later).

- [ ] **Step 4: Write the page**

Create `app/book/[showtimeId]/page.module.css`:

```css
.summary {
  color: var(--color-fg-muted);
  margin-bottom: var(--space-lg);
}
```

Create `app/book/[showtimeId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getShowtimeById, getMovieById, getTicketTypes } from '@/lib/db/queries';
import { getSeatAvailability } from '@/lib/booking/availability';
import { formatShowtime } from '@/lib/format';
import { SeatMap } from './seat-map';
import { createBookingAction } from './actions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function BookShowtimePage({ params }: { params: Promise<{ showtimeId: string }> }) {
  const { showtimeId } = await params;
  const numericShowtimeId = Number(showtimeId);

  if (!Number.isInteger(numericShowtimeId)) {
    notFound();
  }

  const showtime = await getShowtimeById(numericShowtimeId);
  if (!showtime) {
    notFound();
  }

  const movie = await getMovieById(showtime.movieId);
  if (!movie) {
    notFound();
  }

  const [seats, ticketTypes] = await Promise.all([getSeatAvailability(showtime.id), getTicketTypes()]);

  return (
    <main>
      <h1>Book {movie.title}</h1>
      <p className={styles.summary}>{formatShowtime(showtime.startTime)}</p>
      <SeatMap showtimeId={showtime.id} seats={seats} ticketTypes={ticketTypes} createBookingAction={createBookingAction} />
    </main>
  );
}
```

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 6: Manually verify in the browser**

```bash
set -a; source .env.local; set +a
npm run seed:seats
npm run seed:fixture
npm run dev
```

Visit `http://localhost:3000/book/<a real showtime id from your seeded fixture>` — expect the seat grid to render with all 80 seats selectable, ticket steppers to work, and selecting more seats than tickets requested (or vice versa) to be prevented.

- [ ] **Step 7: Commit**

```bash
git add lib/db/queries.ts app/book/
git commit -m "feat: add booking page with seat map and ticket selection"
```

---

### Task 9: Success page

**Files:**
- Create: `app/book/success/page.tsx`
- Create: `app/book/success/page.module.css`

**Interfaces:**
- Consumes: nothing beyond the `booking_id` query parameter Task 8's redirect passes.

- [ ] **Step 1: Write the page**

Create `app/book/success/page.module.css`:

```css
.message {
  color: var(--color-fg-muted);
  line-height: 1.6;
}
```

Create `app/book/success/page.tsx`:

```tsx
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default function BookingSuccessPage() {
  return (
    <main>
      <h1>Thanks for your booking!</h1>
      <p className={styles.message}>
        Check your email for your confirmation — it can take a minute to arrive. Your confirmation includes a link to
        cancel your booking if your plans change.
      </p>
    </main>
  );
}
```

Note: this page deliberately does not claim the booking is confirmed, and does not look up the booking by `booking_id` to display its details — confirmation is driven by the Stripe webhook (Task 10), which may not have finished processing at the instant Stripe redirects the browser here.

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/book/success/
git commit -m "feat: add booking success page"
```

---

### Task 10: Stripe webhook — confirm booking

**Files:**
- Create: `lib/booking/confirm-booking.ts`
- Create: `app/api/webhooks/stripe/route.ts`
- Test: `tests/integration/confirm-booking.test.ts`

**Interfaces:**
- Consumes: `bookings`, `bookingSeats` (Task 1), `getBookingById` (Task 8)
- Produces: `confirmBooking(checkoutSessionId: string, paymentIntentId: string, db?): Promise<{ ok: true; bookingId: number } | { ok: false; reason: string }>` — Task 11 (email) and Task 13 (E2E, indirectly via the real webhook) depend on this signature.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/confirm-booking.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { confirmBooking } from '../../lib/booking/confirm-booking';

const db = createDb(process.env.TEST_DATABASE_URL!);

async function seedPendingBooking(overrides: { heldUntil?: Date } = {}) {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 900003,
      imdbId: 'tt9000003',
      title: 'Confirm Booking Test Movie',
      synopsis: 'Fixture.',
      posterUrl: null,
      runtime: 100,
      director: null,
      actors: [],
      imdbRating: null,
      trailerUrl: null,
    })
    .returning();
  const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: new Date('2026-08-01T18:00:00Z') }).returning();
  const [ticketType] = await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 }).returning();
  const [seat] = await db.insert(seats).values({ row: 'A', seatNumber: 1, isAccessible: false }).returning();

  const [booking] = await db
    .insert(bookings)
    .values({
      showtimeId: showtime.id,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      status: 'pending',
      heldUntil: overrides.heldUntil ?? new Date(Date.now() + 5 * 60 * 1000),
      stripeCheckoutSessionId: 'cs_test_123',
      cancellationToken: 'confirm-test-token',
      totalCents: 1200,
    })
    .returning();
  await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seat.id, ticketTypeId: ticketType.id, priceCents: 1200 });

  return booking;
}

describe('confirmBooking', () => {
  it('marks a pending booking confirmed and clears its hold', async () => {
    const booking = await seedPendingBooking();

    const result = await confirmBooking('cs_test_123', 'pi_test_123', db);

    expect(result).toEqual({ ok: true, bookingId: booking.id });

    const [updated] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('confirmed');
    expect(updated.stripePaymentIntentId).toBe('pi_test_123');
    expect(updated.confirmedAt).not.toBeNull();
  });

  it('does not confirm a booking whose hold already expired and whose seat was reclaimed', async () => {
    const booking = await seedPendingBooking({ heldUntil: new Date(Date.now() - 1000) });

    // Simulate another booking having claimed the same seat after this one's
    // hold expired — the edge case documented in the design spec.
    const [seatRow] = await db.select().from(seats).limit(1);
    const [showtimeRow] = await db.select().from(showtimes).limit(1);
    const [ticketTypeRow] = await db.select().from(ticketTypes).limit(1);
    const [otherBooking] = await db
      .insert(bookings)
      .values({
        showtimeId: showtimeRow.id,
        customerName: 'Someone Else',
        customerEmail: 'other@example.com',
        status: 'confirmed',
        cancellationToken: 'other-token',
        totalCents: 1200,
      })
      .returning();
    await db.insert(bookingSeats).values({ bookingId: otherBooking.id, seatId: seatRow.id, ticketTypeId: ticketTypeRow.id, priceCents: 1200 });

    const result = await confirmBooking('cs_test_123', 'pi_test_123', db);

    expect(result.ok).toBe(false);

    const [updated] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('pending'); // left as-is for manual follow-up, not silently confirmed or deleted
  });

  it('returns ok:false for an unknown checkout session id', async () => {
    const result = await confirmBooking('cs_test_does_not_exist', 'pi_test_123', db);
    expect(result).toEqual({ ok: false, reason: 'No booking found for this checkout session' });
  });
});
```

Add `eq` to the imports: `import { eq } from 'drizzle-orm';`

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/confirm-booking.test.ts`
Expected: FAIL — `lib/booking/confirm-booking.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/booking/confirm-booking.ts`:

```ts
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { bookings, bookingSeats } from '../db/schema';

type Database = typeof defaultDb;

export async function confirmBooking(
  checkoutSessionId: string,
  paymentIntentId: string,
  db: Database = defaultDb,
): Promise<{ ok: true; bookingId: number } | { ok: false; reason: string }> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.stripeCheckoutSessionId, checkoutSessionId)).limit(1);

  if (!booking) {
    return { ok: false, reason: 'No booking found for this checkout session' };
  }

  if (booking.status === 'confirmed') {
    return { ok: true, bookingId: booking.id }; // already confirmed — safe to treat webhook retries as a no-op success
  }

  const thisBookingSeats = await db.select({ seatId: bookingSeats.seatId }).from(bookingSeats).where(eq(bookingSeats.bookingId, booking.id));
  const seatIds = thisBookingSeats.map((row) => row.seatId);

  // Re-validate that no other booking has since confirmed or is actively
  // holding any of these same seats for the same showtime — the rare race
  // where this booking's 10-minute hold expired before payment completed
  // but Stripe's own (minimum 30-minute) session had not yet expired.
  const conflictingRows = await db
    .select({ bookingId: bookingSeats.bookingId })
    .from(bookingSeats)
    .innerJoin(bookings, eq(bookingSeats.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.showtimeId, booking.showtimeId),
        inArray(bookingSeats.seatId, seatIds),
        ne(bookings.id, booking.id),
        ne(bookings.status, 'cancelled'),
      ),
    );

  if (conflictingRows.length > 0) {
    // Left `pending` rather than confirmed or deleted, for manual follow-up —
    // the customer paid but their seat was reclaimed in the gap between hold
    // expiry and payment completion. Not expected to occur in practice.
    return { ok: false, reason: 'Seat conflict detected at confirmation time' };
  }

  await db
    .update(bookings)
    .set({ status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt: new Date(), heldUntil: null })
    .where(eq(bookings.id, booking.id));

  return { ok: true, bookingId: booking.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/confirm-booking.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the webhook route handler**

Create `app/api/webhooks/stripe/route.ts`:

```ts
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { confirmBooking } from '@/lib/booking/confirm-booking';

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    if (paymentIntentId) {
      const result = await confirmBooking(session.id, paymentIntentId);
      if (!result.ok) {
        // Logged, not thrown: Stripe retries on non-2xx responses, and a
        // seat-conflict or unknown-session outcome will not resolve itself
        // on retry, so a 200 here just stops the retry storm. The booking
        // stays `pending`/unconfirmed in our own database for follow-up.
        console.error('Booking confirmation failed:', result.reason);
      }
    }
  }

  return new Response(null, { status: 200 });
}
```

- [ ] **Step 6: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/booking/confirm-booking.ts app/api/webhooks/ tests/integration/confirm-booking.test.ts
git commit -m "feat: add Stripe webhook handler and booking confirmation"
```

---

### Task 11: Confirmation email

**Files:**
- Create: `lib/email/booking-confirmation.ts`
- Modify: `lib/booking/confirm-booking.ts` (call the email send on success)

**Interfaces:**
- Consumes: `resend` (Task 5), `Booking`, `Movie`, `Showtime`, `Seat`, `TicketType` (Task 1), `getBookingSeatsWithDetails` (Task 8), `formatShowtime` (existing)
- Produces: `sendBookingConfirmationEmail(booking: Booking, movie: Movie, showtime: Showtime, seatDetails: Array<{ seat: Seat; ticketType: TicketType; priceCents: number }>): Promise<void>` — called from `confirmBooking`.

- [ ] **Step 1: Write the email sender**

Create `lib/email/booking-confirmation.ts`:

```ts
import { resend } from './resend-client';
import { formatShowtime } from '../format';
import type { Booking, Movie, Showtime, Seat, TicketType } from '../types';

export async function sendBookingConfirmationEmail(
  booking: Booking,
  movie: Movie,
  showtime: Showtime,
  seatDetails: Array<{ seat: Seat; ticketType: TicketType; priceCents: number }>,
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const seatList = seatDetails.map(({ seat, ticketType }) => `${seat.row}${seat.seatNumber} (${ticketType.label})`).join(', ');
  const cancelUrl = `${siteUrl}/booking/cancel/${booking.cancellationToken}`;

  await resend.emails.send({
    from: 'RetfenyMozi <bookings@retfenymozi.example>',
    to: booking.customerEmail,
    subject: `Your booking for ${movie.title} is confirmed`,
    html: `
      <h1>You're all set, ${booking.customerName}!</h1>
      <p><strong>${movie.title}</strong> — ${formatShowtime(showtime.startTime)}</p>
      <p>Seats: ${seatList}</p>
      <p>Total paid: $${(booking.totalCents / 100).toFixed(2)}</p>
      <p>Need to cancel? <a href="${cancelUrl}">Cancel this booking</a></p>
    `,
  });
}
```

- [ ] **Step 2: Wire it into `confirmBooking`**

Modify `lib/booking/confirm-booking.ts`: add these imports at the top —

```ts
import { getMovieById, getShowtimeById, getBookingSeatsWithDetails } from '../db/queries';
import { sendBookingConfirmationEmail } from '../email/booking-confirmation';
```

— and change the success path (the block that runs `await db.update(bookings).set({ status: 'confirmed', ... })`) so it becomes:

```ts
  await db
    .update(bookings)
    .set({ status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt: new Date(), heldUntil: null })
    .where(eq(bookings.id, booking.id));

  const showtime = await getShowtimeById(booking.showtimeId, db);
  const movie = showtime ? await getMovieById(showtime.movieId, db) : null;
  const seatDetails = await getBookingSeatsWithDetails(booking.id, db);

  if (showtime && movie) {
    await sendBookingConfirmationEmail(
      { ...booking, status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt: new Date(), heldUntil: null },
      movie,
      showtime,
      seatDetails,
    );
  }

  return { ok: true, bookingId: booking.id };
```

(this replaces the final `return { ok: true, bookingId: booking.id };` that was already there — do not leave two return statements)

- [ ] **Step 3: Run the existing confirm-booking integration tests again**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/confirm-booking.test.ts`
Expected: PASS (3 tests) — these tests don't set `RESEND_API_KEY`, so if the email send throws in this environment, the test run itself will reveal it; if so, wrap the email send so a failed send is logged rather than un-doing the confirmation (the booking should stay confirmed even if the email bounces) — add a `try`/`catch` around the `sendBookingConfirmationEmail` call, logging the error, rather than letting it propagate and fail the whole webhook handler.

Apply this fix if the tests reveal the need for it:

```ts
  if (showtime && movie) {
    try {
      await sendBookingConfirmationEmail(
        { ...booking, status: 'confirmed', stripePaymentIntentId: paymentIntentId, confirmedAt: new Date(), heldUntil: null },
        movie,
        showtime,
        seatDetails,
      );
    } catch (err) {
      console.error('Failed to send booking confirmation email:', err);
    }
  }
```

- [ ] **Step 4: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/email/booking-confirmation.ts lib/booking/confirm-booking.ts
git commit -m "feat: send confirmation email on booking confirmation"
```

---

### Task 12: Cancellation

**Files:**
- Create: `lib/booking/cancel-booking.ts`
- Create: `app/booking/cancel/[token]/page.tsx`
- Create: `app/booking/cancel/[token]/page.module.css`
- Create: `app/booking/cancel/[token]/actions.ts`
- Test: `tests/integration/cancel-booking.test.ts`

**Interfaces:**
- Consumes: `stripe` (Task 5), `getBookingByCancellationToken`, `getShowtimeById` (Task 8), `bookings` (Task 1)
- Produces: `cancelBooking(cancellationToken: string, db?): Promise<{ ok: true } | { ok: false; reason: string }>`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/cancel-booking.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDb } from '../../lib/db/client';
import { movies, showtimes, seats, ticketTypes, bookings, bookingSeats } from '../../lib/db/schema';
import { cancelBooking } from '../../lib/booking/cancel-booking';

vi.mock('../../lib/stripe/client', () => ({
  stripe: {
    refunds: {
      create: vi.fn().mockResolvedValue({ id: 're_test_123' }),
    },
  },
}));

const db = createDb(process.env.TEST_DATABASE_URL!);

async function seedConfirmedBooking(showtimeStart: Date) {
  await db.delete(bookingSeats);
  await db.delete(bookings);
  await db.delete(showtimes);
  await db.delete(movies);
  await db.delete(seats);
  await db.delete(ticketTypes);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 900004,
      imdbId: 'tt9000004',
      title: 'Cancel Booking Test Movie',
      synopsis: 'Fixture.',
      posterUrl: null,
      runtime: 100,
      director: null,
      actors: [],
      imdbRating: null,
      trailerUrl: null,
    })
    .returning();
  const [showtime] = await db.insert(showtimes).values({ movieId: movie.id, startTime: showtimeStart }).returning();
  const [ticketType] = await db.insert(ticketTypes).values({ code: 'adult', label: 'Adult', priceCents: 1200 }).returning();
  const [seat] = await db.insert(seats).values({ row: 'A', seatNumber: 1, isAccessible: false }).returning();

  const [booking] = await db
    .insert(bookings)
    .values({
      showtimeId: showtime.id,
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      status: 'confirmed',
      stripePaymentIntentId: 'pi_test_cancel',
      cancellationToken: 'cancel-test-token',
      totalCents: 1200,
      confirmedAt: new Date(),
    })
    .returning();
  await db.insert(bookingSeats).values({ bookingId: booking.id, seatId: seat.id, ticketTypeId: ticketType.id, priceCents: 1200 });

  return booking;
}

describe('cancelBooking', () => {
  it('refunds and cancels a confirmed booking for a future showtime', async () => {
    await seedConfirmedBooking(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const result = await cancelBooking('cancel-test-token', db);

    expect(result).toEqual({ ok: true });

    const [updated] = await db.select().from(bookings).where(eq(bookings.status, 'cancelled'));
    expect(updated.cancelledAt).not.toBeNull();
  });

  it('rejects cancelling a booking whose showtime has already passed', async () => {
    await seedConfirmedBooking(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const result = await cancelBooking('cancel-test-token', db);

    expect(result).toEqual({ ok: false, reason: 'This showtime has already passed.' });
  });

  it('returns an already-cancelled result for a token used twice', async () => {
    await seedConfirmedBooking(new Date(Date.now() + 24 * 60 * 60 * 1000));

    await cancelBooking('cancel-test-token', db);
    const secondResult = await cancelBooking('cancel-test-token', db);

    expect(secondResult).toEqual({ ok: false, reason: 'This booking has already been cancelled.' });
  });

  it('returns ok:false for an unknown token', async () => {
    const result = await cancelBooking('does-not-exist', db);
    expect(result).toEqual({ ok: false, reason: 'No booking found for this link.' });
  });
});
```

Add `eq` to the imports: `import { eq } from 'drizzle-orm';`

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/cancel-booking.test.ts`
Expected: FAIL — `lib/booking/cancel-booking.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/booking/cancel-booking.ts`:

```ts
import { eq } from 'drizzle-orm';
import { stripe } from '../stripe/client';
import { db as defaultDb } from '../db/client';
import { bookings, showtimes } from '../db/schema';

type Database = typeof defaultDb;

export async function cancelBooking(
  cancellationToken: string,
  db: Database = defaultDb,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.cancellationToken, cancellationToken)).limit(1);

  if (!booking) {
    return { ok: false, reason: 'No booking found for this link.' };
  }

  if (booking.status === 'cancelled') {
    return { ok: false, reason: 'This booking has already been cancelled.' };
  }

  const [showtime] = await db.select().from(showtimes).where(eq(showtimes.id, booking.showtimeId)).limit(1);
  if (showtime && showtime.startTime.getTime() < Date.now()) {
    return { ok: false, reason: 'This showtime has already passed.' };
  }

  if (booking.stripePaymentIntentId) {
    try {
      await stripe.refunds.create({ payment_intent: booking.stripePaymentIntentId });
    } catch (err) {
      return { ok: false, reason: `Refund failed: ${(err as Error).message}. Please contact support.` };
    }
  }

  await db.update(bookings).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(bookings.id, booking.id));

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/integration/cancel-booking.test.ts`
Expected: PASS (4 tests) — the Stripe `refunds.create` call is mocked via `vi.mock`, so no real Stripe credentials are needed for this test.

- [ ] **Step 5: Write the cancellation page and its server action**

Create `app/booking/cancel/[token]/page.module.css`:

```css
.details {
  color: var(--color-fg-muted);
  margin-bottom: var(--space-lg);
}

.error {
  color: var(--color-accent-text);
}
```

Create `app/booking/cancel/[token]/actions.ts`:

```ts
'use server';

import { cancelBooking } from '@/lib/booking/cancel-booking';

export async function cancelBookingAction(token: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return cancelBooking(token);
}
```

Create `app/booking/cancel/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getBookingByCancellationToken, getShowtimeById, getMovieById } from '@/lib/db/queries';
import { formatShowtime } from '@/lib/format';
import { cancelBookingAction } from './actions';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function CancelBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByCancellationToken(token);

  if (!booking) {
    notFound();
  }

  const showtime = await getShowtimeById(booking.showtimeId);
  const movie = showtime ? await getMovieById(showtime.movieId) : null;

  async function submitCancellation() {
    'use server';
    return cancelBookingAction(token);
  }

  if (booking.status === 'cancelled') {
    return (
      <main>
        <h1>Booking already cancelled</h1>
        <p className={styles.details}>This booking has already been cancelled.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Cancel your booking</h1>
      {movie && showtime && (
        <p className={styles.details}>
          {movie.title} — {formatShowtime(showtime.startTime)}
        </p>
      )}
      <form action={submitCancellation}>
        <button type="submit">Cancel booking</button>
      </form>
    </main>
  );
}
```

Note: this uses a plain form `action` bound to an inline `'use server'` function rather than the Client Component + `useTransition` pattern from Task 8, since this page needs no client-side interactivity (no seat map, no live validation) — a form submission and a full-page re-render is simpler and sufficient here. If displaying the `{ ok: false, reason }` error inline (rather than as a full-page re-render showing the same form again) turns out to matter, revisit with a small Client Component wrapper matching Task 8's pattern instead.

- [ ] **Step 6: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/booking/cancel-booking.ts app/booking/ tests/integration/cancel-booking.test.ts
git commit -m "feat: add booking cancellation with Stripe refund"
```

---

### Task 13: Link showtimes to booking, E2E test, final regression

**Files:**
- Modify: `app/movies/[id]/page.tsx` (showtime becomes a link)
- Test: `tests/e2e/booking.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–12.

- [ ] **Step 1: Modify the movie detail page**

In `app/movies/[id]/page.tsx`, change:

```tsx
        <ul className={styles.showtimeList}>
          {showtimes.map((showtime) => (
            <li key={showtime.id} className={styles.showtimeChip}>
              {formatShowtime(showtime.startTime)}
            </li>
          ))}
        </ul>
```

to:

```tsx
        <ul className={styles.showtimeList}>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>
              <Link href={`/book/${showtime.id}`} className={styles.showtimeChip}>
                {formatShowtime(showtime.startTime)}
              </Link>
            </li>
          ))}
        </ul>
```

Add `import Link from 'next/link';` to the top of the file.

- [ ] **Step 2: Run the existing movie-detail E2E test**

```bash
docker compose up -d db
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e -- tests/e2e/movie-detail.spec.ts
```

Expected: 1 passed — this test doesn't click a showtime, so this change shouldn't break it, but confirm.

- [ ] **Step 3: Write the booking E2E test**

This test requires a real Stripe **test-mode** secret key in `.env.local` (`STRIPE_SECRET_KEY`) to actually reach the Stripe-hosted redirect — see the README note added in Task 5. Unlike the rest of this project's E2E tests, this one is not fully hermetic, matching the same real-credentials requirement the original `npm run seed` (TMDB/OMDb) already has.

Create `tests/e2e/booking.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createDb } from '../../lib/db/client';
import { seedFixture, FIXTURE_MOVIE, FIXTURE_SHOWTIME_START } from '../../scripts/seed-fixture';
import { seedSeats } from '../../scripts/seed-seats';
import { movies, showtimes } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

test.describe('booking flow', () => {
  test.beforeAll(async () => {
    if (!process.env.BASE_URL) {
      const db = createDb(process.env.DATABASE_URL!);
      await seedFixture(db);
      await seedSeats(db);
    }
  });

  test('selecting seats and submitting redirects to a Stripe Checkout URL', async ({ page }) => {
    const db = createDb(process.env.DATABASE_URL!);
    const [movie] = await db.select().from(movies).where(eq(movies.title, FIXTURE_MOVIE.title)).limit(1);
    const [showtime] = await db
      .select()
      .from(showtimes)
      .where(eq(showtimes.movieId, movie.id))
      .limit(1);

    await page.goto(`/book/${showtime.id}`);

    await page.fill('#qty-1', '1'); // ticket type ids are seeded in insertion order: 1 = adult
    await page.fill('#customerName', 'E2E Test');
    await page.fill('#customerEmail', 'e2e@example.com');

    const availableSeatButton = page.locator('button[aria-label^="Seat"]:not([disabled])').first();
    await availableSeatButton.click();

    await page.getByRole('button', { name: 'Continue to payment' }).click();

    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });
  });
});
```

- [ ] **Step 4: Run the booking E2E test**

```bash
set -a; source .env.local; set +a
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
npm run test:e2e -- tests/e2e/booking.spec.ts
```

Expected: 1 passed, **if** `STRIPE_SECRET_KEY` is a real Stripe test-mode key in `.env.local`. If it's blank, this test will fail with a Stripe authentication error — that's expected in an environment without real Stripe credentials configured; note this clearly in your report rather than treating it as a bug in the implementation. Do not weaken the test to avoid this requirement (e.g. by mocking the Stripe API inside the running dev server) — this mirrors the existing, already-accepted precedent that `npm run seed` needs real TMDB/OMDb credentials.

- [ ] **Step 5: Full regression — run the entire test suite**

```bash
set -a; source .env.local; set +a
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
```

Expected: lint 0 errors, typecheck clean, unit and integration suites fully green (none of them need real Stripe/Resend credentials). The e2e suite's booking test specifically needs `STRIPE_SECRET_KEY` as described in Step 4; the pre-existing three E2E tests (browse-movies, showtimes, movie-detail) need no new credentials and must still pass.

- [ ] **Step 6: Commit**

```bash
git add "app/movies/[id]/page.tsx" tests/e2e/booking.spec.ts
git commit -m "feat: link showtimes to booking page, add booking E2E test"
```

---

## Self-Review Notes

- **Spec coverage:** Scope (guest checkout, 80-seat room, ticket types, cancellation, Stripe Checkout) → Tasks 1, 2, 8. Data Model → Task 1. Payment & Seat Holds (independent `held_until`, no background job, webhook-driven confirmation) → Tasks 6, 10. Booking Flow & Pages → Tasks 8, 9, 10, 12, 13. Error Handling (concurrent seat claims, webhook signature failure, refund failure, cancellation rules) → Tasks 6, 10, 12. Testing (unit/integration/E2E split, E2E stopping at the Stripe redirect boundary) → every task's own test plus Task 13.
- **Type consistency checked:** `Seat`, `TicketType`, `Booking`, `BookingSeat`, `SeatAvailability`, `SeatSelection` (Task 1) are the exact shapes every later task's functions accept/return — traced `getSeatAvailability` (Task 3), `createPendingBooking`/`SeatUnavailableError` (Task 6), `buildCheckoutSessionParams`/`createCheckoutSessionForBooking` (Task 7), `confirmBooking` (Task 10), `sendBookingConfirmationEmail` (Task 11), and `cancelBooking` (Task 12) all consume/produce these same names with no drift. `Database = typeof defaultDb` is used consistently for plain-read functions in `lib/db/queries.ts`; transactional writes in `lib/booking/*.ts` construct their own return values inline rather than crossing the `tx`/`db` type boundary, as explained in the Architecture summary.
- **No placeholders:** every step has literal file contents, literal test code, or literal commands. The one explicitly-flagged exception (Task 5's `apiVersion`, Task 13's real-Stripe-credential requirement) is a genuine external-dependency constraint this plan cannot resolve on its own, not an unwritten implementation detail — both are called out explicitly with the exact action to take, matching how the walking-skeleton plan handled the same class of issue for TMDB/OMDb.
