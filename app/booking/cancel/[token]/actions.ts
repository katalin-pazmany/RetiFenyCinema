'use server';

import { cancelBooking } from '@/lib/booking/cancel-booking';

export async function cancelBookingAction(token: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  return cancelBooking(token);
}
