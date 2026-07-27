import { Resend } from 'resend';

let client: Resend | undefined;

function getClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY!);
  }
  return client;
}

// Lazily constructed behind a Proxy so importing this module never reads or
// validates RESEND_API_KEY. Resend's constructor throws synchronously on a
// falsy key, which would crash any test that transitively imports this module
// in an environment without Resend credentials (e.g. the CI `test:unit` job).
// The constructor runs on the first real property access, i.e. the first
// actual API call, so every consumer keeps working unchanged.
export const resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
