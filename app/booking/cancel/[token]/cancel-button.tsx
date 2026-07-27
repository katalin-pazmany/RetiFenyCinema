'use client';

import { useState, useTransition } from 'react';
import styles from './page.module.css';

export function CancelButton({
  token,
  cancelBookingAction,
}: {
  token: string;
  cancelBookingAction: (token: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBookingAction(token);
      if (result.ok) {
        setCancelled(true);
      } else {
        setError(result.reason);
      }
    });
  }

  if (cancelled) {
    return <p>Your booking has been cancelled and refunded.</p>;
  }

  return (
    <div>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" onClick={submit} disabled={isPending}>
        Cancel booking
      </button>
    </div>
  );
}
