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
