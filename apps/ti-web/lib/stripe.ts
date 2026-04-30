import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

function requireEnv(name: string) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getStripe() {
  if (stripeSingleton) return stripeSingleton;
  const key = requireEnv("STRIPE_SECRET_KEY");
  stripeSingleton = new Stripe(key, {
    apiVersion: "2024-06-20",
    typescript: true,
  });
  return stripeSingleton;
}

export function getStripeWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

