import { describe, it, expect, vi, beforeEach } from 'vitest';

const constructEvent = vi.fn();
const confirmBooking = vi.fn();

// Both dependencies are mocked, so the route under test needs neither a Stripe
// webhook secret nor a database — this stays a unit test.
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => constructEvent(...args),
    },
  },
}));

vi.mock('@/lib/booking/confirm-booking', () => ({
  confirmBooking: (...args: unknown[]) => confirmBooking(...args),
}));

const { POST } = await import('@/app/api/webhooks/stripe/route');

function webhookRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/webhooks/stripe', { method: 'POST', body, headers });
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    constructEvent.mockReset();
    confirmBooking.mockReset();
    confirmBooking.mockResolvedValue({ ok: true, bookingId: 1 });
  });

  it('rejects a request with no stripe-signature header', async () => {
    const response = await POST(webhookRequest('{}'));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('Missing stripe-signature header');
    // Never reached signature verification, so nothing was confirmed.
    expect(constructEvent).not.toHaveBeenCalled();
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it('rejects a request whose signature does not verify', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const response = await POST(webhookRequest('{}', { 'stripe-signature': 't=1,v1=deadbeef' }));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('Webhook signature verification failed');
    // A forged payload must never confirm a booking.
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it('ignores a verified event of an unrelated type', async () => {
    constructEvent.mockReturnValue({
      type: 'payment_intent.created',
      data: { object: { id: 'pi_test_123' } },
    });

    const response = await POST(webhookRequest('{}', { 'stripe-signature': 't=1,v1=valid' }));

    expect(response.status).toBe(200);
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it('confirms the booking for a verified checkout.session.completed event', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', payment_intent: 'pi_test_123' } },
    });

    const response = await POST(webhookRequest('{}', { 'stripe-signature': 't=1,v1=valid' }));

    expect(response.status).toBe(200);
    expect(confirmBooking).toHaveBeenCalledWith('cs_test_123', 'pi_test_123');
  });

  it('acknowledges with 200 when confirmation fails, so Stripe stops retrying', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', payment_intent: 'pi_test_123' } },
    });
    confirmBooking.mockResolvedValue({ ok: false, reason: 'Seat conflict detected at confirmation time' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(webhookRequest('{}', { 'stripe-signature': 't=1,v1=valid' }));

    expect(response.status).toBe(200);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
