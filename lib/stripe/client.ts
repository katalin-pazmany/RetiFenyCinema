import Stripe from 'stripe';

let client: Stripe | undefined;

function getClient(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}

// Lazily constructed behind a Proxy so importing this module never reads or
// validates STRIPE_SECRET_KEY. Unit tests (and any other consumer that only
// transitively imports a module touching Stripe) would otherwise crash at
// import time in environments that legitimately have no Stripe credentials.
// The constructor runs on the first real property access, i.e. the first
// actual API call, so every consumer keeps working unchanged.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
