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
